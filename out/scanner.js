"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspace = scanWorkspace;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
// No longer using global cache to avoid cross-scan pollution.
/** Captures router prefixes: app.include_router(main_router, prefix="/api/v1"), app.use("/api", router) */
async function scanForPrefixes(files) {
    const prefixes = {};
    // Group 1: Optional router variable, Group 2: The prefix string
    const PREFIX_REGEX = /(?:\.include_router|\.use|\.register_blueprint)\s*\(\s*([^,()]+)?\s*,?\s*(?:prefix\s*=\s*)?['"`]([^'"`\s?#]+)['"`]/gi;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file.fsPath, 'utf8');
            let match;
            while ((match = PREFIX_REGEX.exec(content)) !== null) {
                const routerVar = match[1] ? match[1].trim() : '';
                const prefix = match[2];
                const cleaned = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                // Store by global, by prefix tail, and by router variable name if found
                prefixes['__global__'] = cleaned;
                const likelyFile = cleaned.split('/').filter(Boolean).pop() || '';
                if (likelyFile)
                    prefixes[likelyFile] = cleaned;
                if (routerVar)
                    prefixes[routerVar] = cleaned;
            }
        }
        catch { }
    }
    return prefixes;
}
/**
 * Hyper-aggressive patterns for endpoint detection
 */
const PATTERNS = [
    // Express/FastAPI Style: app.get("/"), @router.post("/"), @app.route("/"), router.put("/")
    /(?:@)?(?:app|router|server|route|api|blueprint|controller)?\.?(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`\s?#]+)['"`]/gi,
    // Decorator Style (NestJS/TypeORM/Spring): @Get("/"), @PostMapping("/"), etc.
    /@(Get|Post|Put|Delete|Patch|Options|Head|All|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?['"`]([^'"`\s?#]+)['"`]/gi,
    // Flask Style with methods: @app.route("/path", methods=["POST"])
    /@(?:app|router|server|api)\.route\s*\(\s*['"`]([^'"`\s?#]+)['"`](?:.*methods\s*=\s*\[\s*(?:['"`](.*?)['"`],?\s*)+\])?/gi,
    // Generic Fetch/Axios calls (for frontends or internal calls)
    /(?:fetch|axios|get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s?#]+?)['"`]/gi,
];
const SUPPORTED_EXTS = new Set(['.js', '.ts', '.py', '.swift', '.go', '.java', '.php']);
async function scanFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const getLineNum = (idx) => content.substring(0, idx).split('\n').length;
        const results = [];
        for (const regex of PATTERNS) {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(content)) !== null) {
                let method = 'GET';
                let path = '';
                if (match.length === 3) {
                    method = match[1].toUpperCase();
                    path = match[2];
                }
                else if (match.length === 2) {
                    path = match[1];
                }
                if (path && path.startsWith('/')) {
                    results.push({ method, path, file: filePath, line: getLineNum(match.index) });
                }
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
/** Tries to discover and parse Swagger/OpenAPI JSON */
async function scanSwagger(baseURL, manualSource) {
    const sources = manualSource ? [manualSource] : [
        '/swagger.json', '/v2/api-docs', '/openapi.json',
        '/api/openapi.json', '/api/v1/openapi.json',
        '/swagger/v1/swagger.json', '/docs/openapi.json'
    ];
    const results = [];
    for (const src of sources) {
        try {
            const url = src.startsWith('http') ? src : baseURL.replace(/\/$/, '') + (src.startsWith('/') ? src : '/' + src);
            const res = await axios_1.default.get(url, { timeout: 3000 });
            if (res.data && (res.data.paths || res.data.openapi || res.data.swagger)) {
                // Extract server-level prefix if any
                let specPrefix = '';
                if (res.data.servers && res.data.servers[0]?.url) {
                    const u = res.data.servers[0].url;
                    if (u.startsWith('/') && u !== '/')
                        specPrefix = u;
                    else if (u.startsWith('http')) {
                        try {
                            specPrefix = new URL(u).pathname;
                        }
                        catch { }
                    }
                }
                else if (res.data.basePath && res.data.basePath !== '/') {
                    specPrefix = res.data.basePath;
                }
                if (specPrefix === '/')
                    specPrefix = '';
                Object.keys(res.data.paths).forEach(path => {
                    Object.keys(res.data.paths[path]).forEach(method => {
                        if (method.toLowerCase() === 'parameters')
                            return;
                        const fullPath = (specPrefix + path).replace(/\/+/g, '/');
                        results.push({
                            method: method.toUpperCase(),
                            path: fullPath,
                            file: src,
                            isSwagger: true
                        });
                    });
                });
                if (results.length > 0)
                    return results;
            }
        }
        catch { }
    }
    return [];
}
/** Crawls the workspace for supported files and returns unique endpoints */
async function scanWorkspace(baseURL, openapiSource) {
    const endpoints = [];
    const seen = new Set();
    // Reset seen for fresh scan
    endpoints.length = 0;
    seen.clear();
    if (baseURL) {
        const swEndpoints = await scanSwagger(baseURL, openapiSource);
        for (const ep of swEndpoints) {
            const key = `${ep.method}:${ep.path}`;
            if (!seen.has(key)) {
                seen.add(key);
                endpoints.push(ep);
            }
        }
        // We used to return early here. Now we continue to MERGE with code results.
    }
    let files = await vscode.workspace.findFiles('**/*.{js,ts,py,swift,go,java,php}', '{**/node_modules/**,**/.venv/**,**/__pycache__/**,.git/**}');
    const active = vscode.window.activeTextEditor?.document;
    if (active && !files.some(f => f.fsPath === active.uri.fsPath)) {
        files.push(active.uri);
    }
    // First pass: Find prefixes
    const prefixes = await scanForPrefixes(files);
    // Parallelized Scan for maximum performance ("prolamins" optimization)
    const allFound = await Promise.all(files.map(f => scanFile(f.fsPath)));
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const found = allFound[i];
        const fileName = path.basename(file.fsPath, path.extname(file.fsPath)).toLowerCase();
        const prefix = prefixes[fileName] || '';
        for (const ep of found) {
            if (prefix && !ep.path.startsWith(prefix)) {
                ep.path = (prefix.startsWith('/') ? prefix : '/' + prefix) + (ep.path.startsWith('/') ? ep.path : '/' + ep.path);
            }
            else if (prefixes['__global__'] && !ep.path.startsWith(prefixes['__global__'])) {
                const globalPrefix = prefixes['__global__'];
                ep.path = (globalPrefix.startsWith('/') ? globalPrefix : '/' + globalPrefix) + (ep.path.startsWith('/') ? ep.path : '/' + ep.path);
            }
            ep.path = ep.path.replace(/\/+/g, '/');
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
            if (!seen.has(key)) {
                seen.add(key);
                endpoints.push(ep);
            }
        }
    }
    return endpoints;
}
/** Brute-force scan for anything that looks like a path string */
async function deepStringScan(files) {
    const result = [];
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
        }
        catch { }
    }
    return result;
}
//# sourceMappingURL=scanner.js.map