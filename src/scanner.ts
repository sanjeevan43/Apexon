import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import axios from 'axios';

export interface Endpoint {
  method: string;
  path: string;
  file: string;
  isSwagger?: boolean;
}

// Cache for file-level prefixes
const FILE_PREFIXES: Record<string, string> = {};

/** Captures router prefixes: app.include_router(..., prefix="/auth"), app.use("/api", router) */
async function scanForPrefixes(files: vscode.Uri[]) {
  const PREFIX_REGEX = /(?:\.include_router|\.use|\.register_blueprint)\s*\(\s*(?:[^,]+,\s*)?['"`]([^'"`\s?#]+)['"`]/gi;
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file.fsPath, 'utf8');
      let match;
      while ((match = PREFIX_REGEX.exec(content)) !== null) {
        const prefix = match[1];
        const cleaned = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        const likelyFile = cleaned.split('/').pop() || '';
        if (likelyFile) FILE_PREFIXES[likelyFile] = cleaned;
      }
    } catch {}
  }
}

/**
 * Hyper-aggressive patterns for endpoint detection
 */
const PATTERNS = [
  // Express/FastAPI Style: app.get("/"), @router.post("/"), @app.route("/"), router.put("/")
  /(?:@)?(?:app|router|server|route|api|blueprint|controller)?\.?(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`\s?#]+)['"`]/gi,
  // Decorator Style: @get("/"), @Post("/")
  /@(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s?#]+)['"`]/gi,
  // Flask Style with methods: @app.route("/path", methods=["POST"])
  /@(?:app|router|server|api)\.route\s*\(\s*['"`]([^'"`\s?#]+)['"`](?:.*methods\s*=\s*\[\s*(?:['"`](.*?)['"`],?\s*)+\])?/gi,
];

const SUPPORTED_EXTS = new Set(['.js', '.ts', '.py', '.swift', '.go', '.java', '.php']);

async function scanFile(filePath: string): Promise<Endpoint[]> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results: Endpoint[] = [];
    
    for (const regex of PATTERNS) {
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(content)) !== null) {
        // match[1] might be method, match[2] might be path, or vice versa depending on regex
        let method = 'GET';
        let path = '';

        if (match.length === 3) {
          method = match[1].toUpperCase();
          path = match[2];
        } else if (match.length === 2) {
          path = match[1];
        }

        if (path && path.startsWith('/')) {
          results.push({ method, path, file: filePath });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Tries to discover and parse Swagger/OpenAPI JSON */
async function scanSwagger(baseURL: string, manualSource?: string): Promise<Endpoint[]> {
  const sources = manualSource ? [manualSource] : ['/swagger.json', '/v2/api-docs', '/openapi.json'];
  const results: Endpoint[] = [];

  for (const src of sources) {
    try {
      const url = src.startsWith('http') ? src : baseURL.replace(/\/$/, '') + (src.startsWith('/') ? src : '/' + src);
      const res = await axios.get(url, { timeout: 3000 });
      if (res.data && (res.data.paths || res.data.openapi || res.data.swagger)) {
        Object.keys(res.data.paths).forEach(path => {
          Object.keys(res.data.paths[path]).forEach(method => {
            results.push({
              method: method.toUpperCase(),
              path: path,
              file: src,
              isSwagger: true
            });
          });
        });
        if (results.length > 0) return results;
      }
    } catch {}
  }
  return [];
}

/** Crawls the workspace for supported files and returns unique endpoints */
export async function scanWorkspace(baseURL?: string, openapiSource?: string): Promise<Endpoint[]> {
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();

  // PHASE 1: Try Swagger First (Discovery)
  if (baseURL) {
    const swEndpoints = await scanSwagger(baseURL, openapiSource);
    if (swEndpoints.length > 0) return swEndpoints;
  }

  let files = await vscode.workspace.findFiles(
    '**/*.{js,ts,py,swift,go,java,php}',
    '{**/node_modules/**,**/.venv/**,**/__pycache__/**,.git/**}'
  );

  const active = vscode.window.activeTextEditor?.document;
  if (active && !files.some(f => f.fsPath === active.uri.fsPath)) {
    files.push(active.uri);
  }

  // First pass: Find prefixes
  await scanForPrefixes(files);

  for (const file of files) {
    const found = await scanFile(file.fsPath);
    // Apply prefixes
    const fileName = path.basename(file.fsPath, path.extname(file.fsPath)).toLowerCase();
    const prefix = FILE_PREFIXES[fileName] || '';

    for (const ep of found) {
      if (prefix && !ep.path.startsWith(prefix)) {
        ep.path = prefix + (ep.path.startsWith('/') ? ep.path : '/' + ep.path);
      }
      
      const key = `${ep.method}:${ep.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        endpoints.push(ep);
      }
    }
  }

  if (endpoints.length <= 1) {
    const deeper = await deepStringScan(files);
    for (const ep of deeper) {
      const key = `${ep.method}:${ep.path}`;
      if (!seen.has(key)) { seen.add(key); endpoints.push(ep); }
    }
  }

  return endpoints;
}

/** Brute-force scan for anything that looks like a path string */
async function deepStringScan(files: vscode.Uri[]): Promise<Endpoint[]> {
  const result: Endpoint[] = [];
  const PATH_LIKE = /['"`](\/[a-zA-Z0-9/_{}:-]+)['"`]/g;
  const METHODS = /\b(GET|POST|PUT|DELETE|PATCH)\b/i;

  for (const file of files) { // Deep scan all discovered files
    try {
      const content = fs.readFileSync(file.fsPath, 'utf8');
      let match;
      while ((match = PATH_LIKE.exec(content)) !== null) {
        const path = match[1];
        if (path.length > 2 && !path.includes(' ')) {
          // Look for nearby method keywords
          const area = content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + 50));
          const methodMatch = METHODS.exec(area);
          result.push({ method: methodMatch ? methodMatch[1].toUpperCase() : 'GET', path, file: file.fsPath });
        }
      }
    } catch {}
  }
  return result;
}
