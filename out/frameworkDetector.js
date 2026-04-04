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
exports.detectFramework = detectFramework;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/** Detects the framework used in the project by checking config files and dependencies */
async function detectFramework() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length)
        return 'Unknown';
    const root = folders[0].uri.fsPath;
    // 1. Vapor: Look for Package.swift containing 'vapor'
    const packageSwift = path.join(root, 'Package.swift');
    if (fs.existsSync(packageSwift)) {
        const content = fs.readFileSync(packageSwift, 'utf8');
        if (content.toLowerCase().includes('vapor'))
            return 'Vapor';
    }
    // 2. Python (FastAPI/Flask): Check requirements.txt or search source for imports
    const reqLocations = [path.join(root, 'requirements.txt'), path.join(root, 'api', 'requirements.txt')];
    for (const reqTxt of reqLocations) {
        if (fs.existsSync(reqTxt)) {
            const content = fs.readFileSync(reqTxt, 'utf8').toLowerCase();
            if (content.includes('fastapi'))
                return 'FastAPI';
            if (content.includes('flask'))
                return 'Flask';
        }
    }
    // 3. Node.js (Express): Check package.json dependencies
    const pkgJson = path.join(root, 'package.json');
    if (fs.existsSync(pkgJson)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['express'])
                return 'Express';
        }
        catch {
            // Malformed JSON - skip
        }
    }
    return 'Unknown';
}
//# sourceMappingURL=frameworkDetector.js.map