import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface Endpoint {
  method: string;
  path: string;
  file: string;
}

/**
 * Robust regex to capture:
 * - Express: app.get("/path")
 * - FastAPI/Flask: @app.post("/path")
 * - Vapor: router.delete("/path")
 */
const ROUTE_REGEX =
  /(?:@?(?:app|router|server)\.(get|post|put|delete|patch|patch))\s*\(\s*['"`]([^'"`]+)['"`]/gi;

const SUPPORTED_EXTS = new Set(['.js', '.ts', '.py', '.swift']);

/** Finds all route definitions within a single file */
async function scanFile(filePath: string): Promise<Endpoint[]> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const results: Endpoint[] = [];
    let match: RegExpExecArray | null;

    // Reset regex index for safety
    ROUTE_REGEX.lastIndex = 0;
    while ((match = ROUTE_REGEX.exec(content)) !== null) {
      if (match[1] && match[2]) {
        results.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: filePath,
        });
      }
    }
    return results;
  } catch {
    return []; // Skip unreadable files
  }
}

/** Crawls the workspace for supported files and returns unique endpoints */
export async function scanWorkspace(): Promise<Endpoint[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return [];

  const seen = new Set<string>();
  const endpoints: Endpoint[] = [];

  // Exclude common noise directories (node_modules, venv, etc.)
  const files = await vscode.workspace.findFiles(
    '**/*.{js,ts,py,swift}',
    '{**/node_modules/**,**/.venv/**,**/__pycache__/**,.git/**}'
  );

  for (const uri of files) {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;

    const found = await scanFile(uri.fsPath);
    for (const ep of found) {
      // Deduplicate by method + path (e.g., GET /users)
      const key = `${ep.method}:${ep.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        endpoints.push(ep);
      }
    }
  }

  return endpoints;
}
