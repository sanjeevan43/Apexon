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
exports.ApexonDashboard = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const scanner_1 = require("./scanner");
const frameworkDetector_1 = require("./frameworkDetector");
const requestRunner_1 = require("./requestRunner");
const serverManager_1 = require("./serverManager");
const errorExplainer_1 = require("./errorExplainer");
function getConfig(key) {
    return vscode.workspace.getConfiguration('apexon').get(key);
}
async function updateConfig(key, value) {
    await vscode.workspace.getConfiguration('apexon').update(key, value, vscode.ConfigurationTarget.Global);
}
class ApexonDashboard {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.endpoints = [];
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('apexon');
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage(m => this.handleMessage(m));
        this.syncConfig();
        this.doScan();
    }
    createOrShowFullPanel() {
        if (this._panel) {
            this._panel.reveal();
            return;
        }
        this._panel = vscode.window.createWebviewPanel('apexonPanel', 'Apexon Pro Dashboard', vscode.ViewColumn.One, { enableScripts: true });
        this._panel.webview.html = this.getHtml();
        this._panel.webview.onDidReceiveMessage(m => this.handleMessage(m));
        this._panel.onDidDispose(() => { this._panel = undefined; });
        this.syncConfig();
    }
    post(msg) {
        this._view?.webview.postMessage(msg);
        this._panel?.webview.postMessage(msg);
    }
    syncConfig() {
        this.post({
            command: 'updateConfig',
            baseURL: getConfig('baseURL'),
            apiKey: getConfig('apiKey')
        });
    }
    async handleMessage(msg) {
        switch (msg.command) {
            case 'scan':
                await this.doScan(msg.baseURL);
                break;
            case 'run':
                await this.doRun(msg.baseURL, msg.apiKey, msg.indices, msg.overrides);
                break;
            case 'autoPilot':
                await this.doAutoPilot(msg.baseURL, msg.apiKey);
                break;
            case 'export':
                await this.doExport(msg.results);
                break;
            case 'saveConfig':
                await updateConfig('baseURL', msg.baseURL);
                await updateConfig('apiKey', msg.apiKey);
                break;
            case 'autoDiscover':
                await this.doAutoDiscover();
                break;
            case 'stop':
                await this.doStop();
                break;
            case 'openFile':
                await this.doOpenFile(msg.file, msg.line);
                break;
        }
    }
    async doOpenFile(filePath, line) {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        if (line) {
            const pos = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));
        }
    }
    async doStop() {
        this.post({ command: 'status', text: '🛑 STOPPING...', active: false });
        (0, serverManager_1.killServer)();
    }
    async doSwaggerPilot(baseURL, apiKey) {
        this.post({ command: 'status', text: '🤖 GENERATING AI SWAGGER SPEC...' });
        // 1. Get raw endpoints needed for the spec
        const raw = await (0, scanner_1.scanWorkspace)(baseURL);
        if (raw.length === 0)
            return this.post({ command: 'error', text: 'No code structure found to generate spec.' });
        // 2. Generate OpenAPI Spec via AI
        const spec = await (0, errorExplainer_1.generateOpenAPISpecWithAI)(raw, apiKey);
        if (!spec)
            return this.post({ command: 'error', text: 'AI failed to generate Swagger JSON.' });
        this.post({ command: 'status', text: 'Spec Ready. Re-scanning with AI Context...' });
        // 3. Process the spec manually (mocking scanSwagger effect)
        const swEndpoints = [];
        if (spec.paths) {
            Object.keys(spec.paths).forEach(path => {
                Object.keys(spec.paths[path]).forEach(method => {
                    swEndpoints.push({
                        method: method.toUpperCase(),
                        path: path,
                        file: 'AI-Generated-Spec.json',
                        isSwagger: true
                    });
                });
            });
        }
        this.endpoints = swEndpoints;
        this.post({ command: 'scanResult', endpoints: this.endpoints });
        // 4. Run the rest of the flow
        if (this.endpoints.length > 0) {
            const allIndices = this.endpoints.map((_, i) => i);
            const results = await this.doRun(baseURL, apiKey, allIndices);
            if (results && results.length > 0) {
                this.post({ command: 'status', text: 'Generating Report...' });
                await this.doExport(results);
            }
        }
        this.post({ command: 'status', text: 'AI Swagger Workflow Done', active: false });
    }
    async doAutoDiscover() {
        this.post({ command: 'status', text: 'Auto-Discovering Environment...' });
        let baseURL = getConfig('baseURL');
        let apiKey = getConfig('apiKey');
        // 1. Infer Base URL if missing
        if (!baseURL || baseURL === 'http://localhost:8000') {
            const framework = await (0, frameworkDetector_1.detectFramework)();
            const portMap = { 'FastAPI': '8000', 'Flask': '5000', 'Express': '3000', 'Vapor': '8080' };
            baseURL = `http://localhost:${portMap[framework] || '8080'}`;
            await updateConfig('baseURL', baseURL);
        }
        // 2. Infer API Key from .env if missing
        if (!apiKey) {
            const envFiles = await vscode.workspace.findFiles('.env');
            if (envFiles.length > 0) {
                try {
                    const content = fs.readFileSync(envFiles[0].fsPath, 'utf8');
                    const match = content.match(/(?:API_KEY|TOKEN|SECRET|ACCESS_TOKEN)\s*=\s*['"`]?([^'"`\s#]+)['"`]?/i);
                    if (match) {
                        apiKey = match[1];
                        await updateConfig('apiKey', apiKey);
                    }
                }
                catch { }
            }
        }
        this.syncConfig();
        this.post({ command: 'status', text: 'ENVIRONMENT CALIBRATED. ALL SYSTEMS NOMINAL.', active: false });
        await this.doScan(baseURL);
    }
    async doScan(baseURL) {
        this.post({ command: 'status', text: 'SCANNING WORKSPACE: MAPPING ARCHITECTURAL ENDPOINTS...' });
        this.endpoints = await (0, scanner_1.scanWorkspace)(baseURL);
        if (this.endpoints.length === 0) {
            this.post({ command: 'error', text: 'API structure not detected' });
            return;
        }
        const framework = await (0, frameworkDetector_1.detectFramework)();
        this.post({ command: 'scanResult', endpoints: this.endpoints, framework });
    }
    async doAutoPilot(baseURL, apiKey) {
        this.post({ command: 'status', text: 'PROTOCOL: AUTO-OPTIMIZE ACTIVATED. STAND BY.' });
        let currentURL = baseURL || getConfig('baseURL');
        let currentKey = apiKey || getConfig('apiKey');
        // 1. Auto-Discovery if missing or default
        if (!currentURL || currentURL === 'http://localhost:8000') {
            this.post({ command: 'status', text: 'SEARCHING FOR HOST SIGNATURE...' });
            const framework = await (0, frameworkDetector_1.detectFramework)();
            const portMap = { 'FastAPI': '8000', 'Flask': '5000', 'Express': '3000', 'Vapor': '8080' };
            currentURL = `http://localhost:${portMap[framework] || '8080'}`;
            await updateConfig('baseURL', currentURL);
        }
        if (!currentKey) {
            this.post({ command: 'status', text: 'DECRYPTING SECURITY TOKENS...' });
            const envFiles = await vscode.workspace.findFiles('.env');
            if (envFiles.length > 0) {
                try {
                    const content = fs.readFileSync(envFiles[0].fsPath, 'utf8');
                    const match = content.match(/(?:API_KEY|TOKEN|SECRET|ACCESS_TOKEN)\s*=\s*['"`]?([^'"`\s#]+)['"`]?/i);
                    if (match) {
                        currentKey = match[1];
                        await updateConfig('apiKey', currentKey);
                    }
                }
                catch { }
            }
        }
        this.syncConfig();
        // 2. Scan
        await this.doScan(currentURL);
        if (this.endpoints.length === 0) {
            this.post({ command: 'status', text: 'No endpoints found. Stopping.', active: false });
            return;
        }
        // 3. Execution
        this.post({ command: 'status', text: `EXECUTING STRIKE ON ${this.endpoints.length} TARGETS...` });
        const allIndices = this.endpoints.map((_, i) => i);
        const results = await this.doRun(currentURL, currentKey, allIndices);
        // 4. Auto-Export
        if (results && results.length > 0) {
            this.post({ command: 'status', text: 'COMPILING POST-ACTION DATA...' });
            await this.doExport(results);
        }
        this.post({ command: 'status', text: 'MISSION ACCOMPLISHED. DATA ARCHIVED.', active: false });
    }
    async doExport(results) {
        if (!results || results.length === 0)
            return vscode.window.showErrorMessage('No test results to export.');
        const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(results, null, 2),
            language: 'json'
        });
        await vscode.window.showTextDocument(doc);
    }
    classifyError(status) {
        switch (status) {
            case 400: return { reason: 'Bad Request', fix: 'Payload structure invalid' };
            case 401: return { reason: 'Unauthorized', fix: 'Invalid API key or token' };
            case 403: return { reason: 'Forbidden', fix: 'Insufficient permissions' };
            case 404: return { reason: 'Not Found', fix: 'Wrong endpoint or path' };
            case 500: return { reason: 'Server Error', fix: 'Internal server issue' };
            case 503: return { reason: 'Service Unavailable', fix: 'Server overloaded or down' };
            default: return { reason: 'HTTP ' + status, fix: 'Check request body and headers' };
        }
    }
    async doRun(baseURL, apiKey, indices, overrides = {}) {
        if (!indices?.length) {
            this.post({ command: 'error', text: 'No endpoints selected.' });
            return [];
        }
        if (!baseURL) {
            this.post({ command: 'error', text: 'Base URL missing.' });
            return [];
        }
        if (!apiKey) {
            this.post({ command: 'error', text: 'API Key missing.' });
            return [];
        }
        this.post({ command: 'status', text: 'SECURE LINK ESTABLISHED. PREPARING PAYLOAD...' });
        const framework = await (0, frameworkDetector_1.detectFramework)();
        const serverErr = await (0, serverManager_1.ensureServerRunning)(baseURL, framework);
        if (serverErr) {
            this.post({ command: 'error', text: serverErr });
            return [];
        }
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        const results = [];
        const idCache = {};
        // Initial clean-up of problems
        this.diagnosticCollection.clear();
        const newDiagnostics = new Map();
        for (const idx of indices) {
            const ep = this.endpoints[idx];
            this.post({ command: 'status', text: `ANALYZING TARGET: ${ep.path}...` });
            // --- SMART DEPENDENCY RESOLUTION ---
            let currentPath = ep.path;
            // 1. Apply User Manual Overrides First
            const epOverrides = overrides[idx.toString()] || {};
            Object.keys(epOverrides).forEach(param => {
                const val = epOverrides[param];
                if (val) {
                    // Replace both {param} and :param styles
                    const regex = new RegExp(`\\{${param}\\}|:${param}\\b`, 'g');
                    currentPath = currentPath.replace(regex, val);
                }
            });
            // 2. Auto-Discovery for remaining placeholders
            const placeholders = currentPath.match(/\{([^}]+)\}|:([a-zA-Z0-9_]+)/g) || [];
            for (const placeholder of placeholders) {
                const paramName = placeholder.startsWith('{') ? placeholder.slice(1, -1) : placeholder.slice(1);
                // If still has placeholder and no manual override, try cache
                if (!idCache[paramName]) {
                    const listPath = ep.path.split(/\{|:/)[0].replace(/\/$/, '') || '/';
                    const dependency = this.endpoints.find(e => e.method === 'GET' && e.path === listPath && e !== ep);
                    if (dependency) {
                        this.post({ command: 'status', text: `ID_MISSING: FETCHING DEPENDENCY FROM ${listPath}...` });
                        const depRes = await (0, requestRunner_1.runRequest)(dependency, baseURL, 5000, null, listPath, headers);
                        if (depRes.status === 200 && depRes.responseData) {
                            const data = Array.isArray(depRes.responseData) ? depRes.responseData[0] : depRes.responseData;
                            if (data && typeof data === 'object') {
                                Object.keys(data).forEach(key => { idCache[key] = data[key]; });
                                if (!idCache['id'])
                                    idCache['id'] = data.id || Object.values(idCache)[0];
                                if (!idCache[paramName])
                                    idCache[paramName] = data[paramName] || data.id || data.uuid || Object.values(idCache)[0];
                            }
                        }
                    }
                }
                const val = idCache[paramName] || idCache['id'] || Object.values(idCache)[0];
                if (val) {
                    currentPath = currentPath.replace(placeholder, val);
                }
            }
            const smartPath = await (0, errorExplainer_1.autoExpandUrlWithAI)(currentPath, ep.method, apiKey, ep.file);
            let body = null;
            if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
                body = await (0, errorExplainer_1.generateRequestBodyWithAI)(ep.path, ep.method, apiKey, ep.file);
            }
            this.post({ command: 'status', text: `ENGAGING: ${ep.method} -> ${smartPath}...` });
            let res = await (0, requestRunner_1.runRequest)(ep, baseURL, 5000, body, smartPath, headers);
            res.passed = res.status === 200 || res.status === 201;
            let ai;
            let classification = null;
            // --- SELF-HEALING LOGIC ---
            if (!res.passed) {
                classification = this.classifyError(res.status ?? 0);
                // 1. Recover from 422 (Unprocessable Entity) using AI to fix body
                if (res.status === 422 && apiKey) {
                    this.post({ command: 'status', text: `ERROR 422: ADAPTIVE PAYLOAD RESTRUCTURING...` });
                    const fixAi = await (0, errorExplainer_1.explainWithAI)(smartPath, ep.method, body, res.responseData, 422, apiKey);
                    const fixedBody = await (0, errorExplainer_1.generateRequestBodyWithAI)(ep.path, ep.method, apiKey, ep.file + "\nERROR CONTEXT: " + JSON.stringify(res.responseData));
                    const retryRes = await (0, requestRunner_1.runRequest)(ep, baseURL, 5000, fixedBody, smartPath, headers);
                    if (retryRes.status === 200 || retryRes.status === 201) {
                        res = { ...retryRes, passed: true };
                        ai = { ...fixAi, why: 'Fixed payload structure based on validation errors', fix: 'Healed' };
                    }
                }
                // 2. Recover from 404 (Not Found) via Path Correction
                if (res.status === 404 && apiKey) {
                    ai = await (0, errorExplainer_1.explainWithAI)(smartPath, ep.method, res.requestBody, res.responseData, res.status, apiKey);
                    if (ai?.newPath && ai.newPath !== smartPath) {
                        this.post({ command: 'status', text: `ERROR 404: RECALIBRATING COORDINATES...` });
                        const retryRes = await (0, requestRunner_1.runRequest)(ep, baseURL, 5000, body, ai.newPath, headers);
                        if (retryRes.status === 200 || retryRes.status === 201) {
                            res = { ...retryRes, passed: true };
                            ai = { ...ai, why: 'Fixed prefix automatically', fix: 'Healed' };
                        }
                    }
                }
            }
            else {
                // Collect IDs from successful GET responses for future use
                if (ep.method === 'GET' && res.responseData) {
                    const data = Array.isArray(res.responseData) ? res.responseData[0] : res.responseData;
                    if (data && typeof data === 'object') {
                        Object.keys(data).forEach(key => {
                            if (key.toLowerCase().endsWith('id') || key.toLowerCase() === 'uuid') {
                                idCache[key] = data[key];
                                // Also fallback to generic 'id' if possible
                                if (!idCache['id'])
                                    idCache['id'] = data[key];
                            }
                        });
                    }
                }
            }
            // --- PUSH TO VSCODE PROBLEMS PANEL ---
            if (!res.passed && ep.file && ep.line) {
                const severity = res.status === 404 ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
                const msg = `[APE-BREACH] ${ep.method} ${ep.path} -> ${res.status || res.statusText}. ${ai?.why || 'Structural anomaly detected.'}`;
                const diagnostic = new vscode.Diagnostic(new vscode.Range(ep.line - 1, 0, ep.line - 1, 100), msg, severity);
                diagnostic.source = 'Apexon Jarvis';
                const existing = newDiagnostics.get(ep.file) || [];
                existing.push(diagnostic);
                newDiagnostics.set(ep.file, existing);
            }
            results[idx] = { ...res, ai, classification };
            this.post({ command: 'partialResult', results });
        }
        // Apply all diagnostics at once
        newDiagnostics.forEach((diags, file) => {
            this.diagnosticCollection.set(vscode.Uri.file(file), diags);
        });
        this.post({ command: 'status', text: 'ANALYSIS COMPLETE.', active: false });
        return results;
    }
    getHtml() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Space+Mono&display=swap');
  :root {
    --bg: #020617;
    --card: rgba(15, 23, 42, 0.7);
    --accent: #0ea5e9;
    --accent-glow: rgba(14, 165, 233, 0.3);
    --success: #10b981;
    --error: #f43f5e;
    --text: #f0f9ff;
    --text-dim: #94a3b8;
    --border: rgba(14, 165, 233, 0.2);
  }
  body { 
    background: var(--bg); 
    color: var(--text); 
    font-family: 'Rajdhani', sans-serif; 
    padding: 20px; 
    font-size: 13px; 
    margin: 0; 
    overflow-x: hidden;
    background-image: 
      radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.15) 0%, transparent 60%),
      radial-gradient(circle at 10% 90%, rgba(16, 185, 129, 0.05) 0%, transparent 40%),
      linear-gradient(rgba(14, 165, 233, 0.03) 1.5px, transparent 1.5px),
      linear-gradient(90deg, rgba(14, 165, 233, 0.03) 1.5px, transparent 1.5px);
    background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
  }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 15px; }
  .logo-ring { width: 40px; height: 40px; border: 2px solid var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; animation: pulse 2s infinite; }
  .logo-ring::after { content: ''; position: absolute; width: 30px; height: 30px; border: 1px dashed var(--accent); border-radius: 50%; animation: spin 4s linear infinite; }
  .title { text-transform: uppercase; letter-spacing: 3px; font-weight: 700; font-size: 18px; color: var(--accent); }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--accent-glow); } 70% { box-shadow: 0 0 0 10px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }

  .status-hud { background: var(--card); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 20px; position: relative; overflow: hidden; min-height: 55px; }
  .status-hud::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--accent); }
  .status-label { font-size: 10px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px; letter-spacing: 1px; }
  .status-text { font-size: 13px; font-weight: 600; color: var(--accent); white-space: nowrap; overflow: hidden; border-right: 2px solid var(--accent); width: 0; animation: typing 2.5s steps(40, end) forwards, blink 0.75s infinite; font-family: 'Space Mono', monospace; }
  @keyframes typing { from { width: 0 } to { width: 100% } }
  @keyframes blink { from, to { border-color: transparent } 50% { border-color: var(--accent) } }

  .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px; }
  button { 
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(14, 165, 233, 0.1)); 
    border: 1px solid var(--accent); 
    color: var(--accent); 
    padding: 14px; 
    border-radius: 10px; 
    font-family: 'Rajdhani', sans-serif; 
    font-weight: 700; 
    text-transform: uppercase; 
    letter-spacing: 2px; 
    cursor: pointer; 
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; align-items: center; justify-content: center; gap: 10px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    position: relative; overflow: hidden;
  }
  button::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); transition: 0.5s; }
  button:hover::before { left: 100%; }
  button:hover { background: var(--accent); color: #fff; box-shadow: 0 0 25px var(--accent-glow); transform: translateY(-3px); }
  button:active { transform: translateY(-1px); }
  #auto-btn { background: linear-gradient(135deg, var(--accent), #0369a1); color: #fff; grid-column: span 2; border: none; }
  #auto-btn:hover { background: linear-gradient(135deg, #38bdf8, var(--accent)); }

  .stats-deck { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 25px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); padding: 10px; border-radius: 8px; text-align: center; }
  .stat-val { font-size: 18px; font-weight: 700; color: #fff; }
  .stat-lbl { font-size: 9px; color: var(--text-dim); text-transform: uppercase; }

  .endpoint-list { background: rgba(0,0,0,0.2); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.05); }
  .group-title { font-size: 11px; color: var(--accent); font-weight: 700; margin: 15px 0 8px 5px; text-transform: uppercase; opacity: 0.8; }
  .item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; transition: all 0.3s; overflow: hidden; }
  .item:hover { border-color: var(--accent); background: rgba(14, 165, 233, 0.05); }
  .item-head { padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .method-tag { font-family: 'Space Mono', monospace; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #334155; color: #fff; min-width: 45px; text-align: center; }
  .p-GET { background: #0ea5e9; } .p-POST { background: #10b981; } .p-PUT { background: #f59e0b; } .p-DELETE { background: #f43f5e; }
  .path-text { font-family: 'Space Mono', monospace; font-size: 11px; flex: 1; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; }
  .s-pass { background: var(--success); box-shadow: 0 0 8px var(--success); }
  .s-fail { background: var(--error); box-shadow: 0 0 8px var(--error); }

  .details { padding: 15px; background: rgba(0,0,0,0.3); border-top: 1px solid var(--border); display: none; }
  .open .details { display: block; animation: slideDown 0.3s ease-out; }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  
  .param-box { margin-bottom: 12px; padding: 12px; background: rgba(14, 165, 233, 0.1); border-radius: 8px; border: 1px solid var(--accent); }
  .param-title { font-size: 10px; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; font-weight: 700; letter-spacing: 1px; }
  .param-input { width: 100%; background: #000; border: 1px solid var(--border); color: var(--accent); padding: 8px; border-radius: 4px; font-family: 'Space Mono', monospace; font-size: 11px; margin-bottom: 8px; box-sizing: border-box; }
  .param-input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 8px var(--accent-glow); }

  pre { background: rgba(0,0,0,0.5); padding: 15px; border-radius: 10px; font-size: 11px; overflow-x: auto; color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.15); font-family: 'Space Mono', monospace; line-height: 1.4; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5); }
  .ai-diagnosis { 
    background: linear-gradient(90deg, rgba(14, 165, 233, 0.12), transparent); 
    border-left: 4px solid var(--accent); 
    padding: 18px; 
    border-radius: 4px 12px 12px 4px; 
    margin-top: 20px; 
    position: relative;
    border: 1px solid rgba(14, 165, 233, 0.1);
    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
  }
  .ai-diagnosis b { display: block; color: var(--accent); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1.5px; }
  .ai-fix { color: var(--success); font-weight: 700; margin-top: 10px; display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .ai-fix::before { content: '⚡'; }
  
  #scan-line { position: fixed; top: 0; left: 0; width: 100%; height: 2px; background: var(--accent); opacity: 0; pointer-events: none; z-index: 100; transition: opacity 0.3s; }
  .scanning #scan-line { animation: scan 2s infinite linear; opacity: 0.5; }
  @keyframes scan { from { top: 0% } to { top: 100% } }

  .config-drawer { background: var(--card); padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .config-drawer input { background: #000; border: 1px solid var(--border); color: var(--accent); padding: 8px; border-radius: 4px; font-family: 'Space Mono', monospace; font-size: 11px; outline: none; }
</style>
</head>
<body id="main-body">
  <div id="scan-line"></div>
  <div class="header">
    <div class="logo-ring"><div style="width: 10px; height: 10px; background: var(--accent); border-radius: 50%;"></div></div>
    <div class="title">Apexon <span style="font-size: 10px; vertical-align: middle; opacity: 0.5;">Jarvis Interface</span></div>
  </div>

  <div class="status-hud">
    <div class="status-label">Command Center Status</div>
    <div id="status-text" class="status-text">SYSTEM ONLINE. READY FOR INSTRUCTION.</div>
  </div>

  <div class="config-drawer">
    <input id="url-in" type="text" placeholder="BASE_URL_NULL">
    <input id="key-in" type="password" placeholder="SECURE_KEY_HASH">
  </div>

  <div class="action-grid">
    <button id="scan-btn">Initiate Scan</button>
    <button id="run-btn">Run Analysis</button>
    <button id="auto-btn">PROTOCOL: AUTO-REPAIR</button>
  </div>

  <div class="stats-deck">
    <div class="stat-card"><div class="stat-val" id="s-total">0</div><div class="stat-lbl">Endpoints</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--success)" id="s-passed">0</div><div class="stat-lbl">Secure</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--error)" id="s-failed">0</div><div class="stat-lbl">Breached</div></div>
    <div class="stat-card"><div class="stat-val" id="s-avg">0</div><div class="stat-lbl">Latency</div></div>
  </div>

  <div class="endpoint-list" id="list">
    <div style="text-align: center; color: var(--text-dim); padding: 40px;">SCAN WORKSPACE TO BEGIN.</div>
  </div>

<script>
  (function() {
    const vscode = acquireVsCodeApi();
    const statusText = document.getElementById('status-text');
    const list = document.getElementById('list');
    const urlIn = document.getElementById('url-in');
    const keyIn = document.getElementById('key-in');

    let endpoints = [];
    let results = [];

    const updateStatus = (text, active = true) => {
      statusText.classList.remove('typing');
      void statusText.offsetWidth; 
      statusText.innerText = text;
      statusText.style.width = '0';
      statusText.style.animation = 'typing 2s steps(40, end) forwards, blink 0.75s infinite';
      document.getElementById('main-body').classList.toggle('scanning', active);
    };

    urlIn.onchange = () => vscode.postMessage({ command: 'saveConfig', baseURL: urlIn.value, apiKey: keyIn.value });
    keyIn.onchange = () => vscode.postMessage({ command: 'saveConfig', baseURL: urlIn.value, apiKey: keyIn.value });

    document.getElementById('scan-btn').onclick = () => vscode.postMessage({ command: 'autoDiscover' });
    document.getElementById('auto-btn').onclick = () => vscode.postMessage({ command: 'autoPilot', baseURL: urlIn.value, apiKey: keyIn.value });
    document.getElementById('run-btn').onclick = () => {
      const idxs = Array.from(document.querySelectorAll('.chk:checked')).map(c => parseInt(c.dataset.idx));
      const overrides = {};
      idxs.forEach(idx => {
        const inputs = document.querySelectorAll('.override-' + idx);
        if (inputs.length) {
          overrides[idx] = {};
          inputs.forEach(input => { if (input.value) overrides[idx][input.dataset.param] = input.value; });
        }
      });
      vscode.postMessage({ command: 'run', baseURL: urlIn.value, apiKey: keyIn.value, indices: idxs, overrides });
    };

    window.addEventListener('message', event => {
      const data = event.data;
      if (data.command === 'updateConfig') { urlIn.value = data.baseURL || ''; keyIn.value = data.apiKey || ''; }
      if (data.command === 'status') updateStatus(data.text, data.active !== false);
      if (data.command === 'scanResult') { endpoints = data.endpoints || []; results = []; render(); }
      if (data.command === 'partialResult') { results = data.results || []; render(); }
    });

    function render() {
      if (!endpoints.length) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">NO TARGETS FOUND.</div>'; return; }
      const grps = {};
      let p=0, f=0, tt=0, count=0;
      endpoints.forEach((ep, i) => {
        const file = ep.file.split(/[\/\\\\]/).pop();
        if (!grps[file]) grps[file] = [];
        grps[file].push({ep, i});
      });
      let html = '';
      Object.keys(grps).forEach(fN => {
        html += '<div class="group-title">' + fN + '</div>';
        grps[fN].forEach(({ ep, i }) => {
          const res = results[i];
          if (res?.passed) p++; else if (res) f++;
          if (res?.durationMs) { tt += res.durationMs; count++; }
          const params = ep.path.match(/\{([^}]+)\}|:([a-zA-Z0-9_]+)/g) || [];
          html += \`
            <div class="item" id="i-\${i}">
              <div class="item-head">
                <input type="checkbox" class="chk" data-idx="\${i}" checked onclick="event.stopPropagation()">
                <div style="flex:1; display:flex; align-items:center; gap:10px" onclick="document.getElementById('i-\${i}').classList.toggle('open')">
                  <span class="method-tag p-\${ep.method}">\${ep.method}</span>
                  <span class="path-text">\${ep.path}</span>
                  \${res ? \`<div class="status-dot \${res.passed ? 's-pass' : 's-fail'}"></div>\` : ''}
                </div>
              </div>
              <div class="details">
                \${params.length ? \`
                  <div class="param-box">
                    <div class="param-title">Override Security Parameters</div>
                    \${params.map(p => {
                      const name = p.startsWith('{') ? p.slice(1,-1) : p.slice(1);
                      return \`<input class="param-input override-\${i}" data-param="\${name}" placeholder="Value for \${p}">\`;
                    }).join('')}
                  </div>
                \` : ''}
                \${res?.classification ? \`<div style="color:var(--error); margin-bottom:10px; font-weight:700">ALERT: \${res.classification.reason}</div>\` : ''}
                <div style="font-size:10px; color:var(--text-dim); margin-bottom:8px; display:flex; justify-content:space-between">DATA STREAM INDICATOR <span>SECURE_ENCRYPTION_v1.2</span></div>
                <pre>\${JSON.stringify(res?.responseData || {}, null, 2)}</pre>
                \${res?.ai ? \`
                  <div class="ai-diagnosis">
                    <b>JARVIS DIAGNOSTIC ANALYSIS</b>
                    <div style="color: var(--text); opacity: 0.9; margin-bottom: 10px;">\${res.ai.why}</div>
                    <div class="ai-fix">PROTOCOL REPAIR: \${res.ai.fix}</div>
                  </div>
                \` : ''}
              </div>
            </div>
          \`;
        });
      });
      list.innerHTML = html;
      document.getElementById('s-total').innerText = endpoints.length;
      document.getElementById('s-passed').innerText = p;
      document.getElementById('s-failed').innerText = f;
      document.getElementById('s-avg').innerText = count > 0 ? Math.round(tt/count) : 0;
    }
  })();
</script>
</body>
</html>`;
    }
}
exports.ApexonDashboard = ApexonDashboard;
//# sourceMappingURL=webviewPanel.js.map