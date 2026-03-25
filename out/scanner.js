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
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspace = scanWorkspace;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/**
 * Robust regex to capture:
 * - Express: app.get("/path")
 * - FastAPI/Flask: @app.post("/path")
 * - Vapor: router.delete("/path")
 */
const ROUTE_REGEX = /(?:@?(?:app|router|server)\.(get|post|put|delete|patch|patch))\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const SUPPORTED_EXTS = new Set(['.js', '.ts', '.py', '.swift']);
/** Finds all route definitions within a single file */
async function scanFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const results = [];
        let match;
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
    }
    catch {
        return []; // Skip unreadable files
    }
}
/** Crawls the workspace for supported files and returns unique endpoints */
async function scanWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
        return [];
    const seen = new Set();
    const endpoints = [];
    // Exclude common noise directories (node_modules, venv, etc.)
    const files = await vscode.workspace.findFiles('**/*.{js,ts,py,swift}', '{**/node_modules/**,**/.venv/**,**/__pycache__/**,.git/**}');
    for (const uri of files) {
        const ext = path.extname(uri.fsPath).toLowerCase();
        if (!SUPPORTED_EXTS.has(ext))
            continue;
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
//# sourceMappingURL=scanner.js.map