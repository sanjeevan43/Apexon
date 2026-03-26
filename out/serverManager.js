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
exports.ensureServerRunning = ensureServerRunning;
exports.killServer = killServer;
const cp = __importStar(require("child_process"));
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
/** Framework-specific start commands */
const START_COMMANDS = {
    FastAPI: ['uvicorn', ['main:app', '--reload']],
    Flask: ['flask', ['run']],
    Express: ['npm', ['start']],
    Vapor: ['swift', ['run']],
};
// Global process handle to kill on deactivation
let serverProcess;
/** Checks if the server is already running by pinging baseURL or baseURL/health */
async function isServerUp(baseURL) {
    try {
        const url = baseURL.replace(/\/$/, '');
        await axios_1.default.get(`${url}/health`, { timeout: 1000 });
        return true;
    }
    catch {
        try {
            await axios_1.default.get(baseURL, { timeout: 1000 });
            return true;
        }
        catch {
            return false;
        }
    }
}
/** Ensures the server is running. Spawns it if necessary. */
async function ensureServerRunning(baseURL, framework) {
    // Check if ALREADY up - Be quiet here
    if (await isServerUp(baseURL))
        return null;
    const startArgs = START_COMMANDS[framework];
    if (!startArgs) {
        return `Server at ${baseURL} is not responding. Start your ${framework} server manually.`;
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    // Spawning the server process
    serverProcess = cp.spawn(startArgs[0], startArgs[1], {
        cwd: root,
        shell: true,
        stdio: 'ignore', // Avoid cluttering the console
    });
    // Wait for it to wake up
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500)); // Polled check every 1.5s
        if (await isServerUp(baseURL)) {
            await new Promise(r => setTimeout(r, 500)); // Extra puffert-delay for real-world readiness
            return null;
        }
    }
    return `Timed out waiting for server @ ${baseURL}. Check start logs.`;
}
/** Terminates the spawned server process if it exists */
function killServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        serverProcess = undefined;
    }
}
//# sourceMappingURL=serverManager.js.map