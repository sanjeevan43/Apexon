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
                await this.doRun(msg.baseURL, msg.apiKey, msg.indices);
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
        this.post({ command: 'status', text: 'Environment Ready', active: false });
        await this.doScan(baseURL);
    }
    async doScan(baseURL) {
        this.post({ command: 'status', text: 'PHASE 1: API Discovery...' });
        this.endpoints = await (0, scanner_1.scanWorkspace)(baseURL);
        if (this.endpoints.length === 0) {
            this.post({ command: 'error', text: 'API structure not detected' });
            return;
        }
        const framework = await (0, frameworkDetector_1.detectFramework)();
        this.post({ command: 'scanResult', endpoints: this.endpoints, framework });
    }
    async doAutoPilot(baseURL, apiKey) {
        this.post({ command: 'status', text: '🚀 FULLY AUTOMATED MODE ACTIVE' });
        let currentURL = baseURL || getConfig('baseURL');
        let currentKey = apiKey || getConfig('apiKey');
        // 1. Auto-Discovery if missing or default
        if (!currentURL || currentURL === 'http://localhost:8000') {
            this.post({ command: 'status', text: 'Auto-Discovering Base URL...' });
            const framework = await (0, frameworkDetector_1.detectFramework)();
            const portMap = { 'FastAPI': '8000', 'Flask': '5000', 'Express': '3000', 'Vapor': '8080' };
            currentURL = `http://localhost:${portMap[framework] || '8080'}`;
            await updateConfig('baseURL', currentURL);
        }
        if (!currentKey) {
            this.post({ command: 'status', text: 'Auto-Discovering API Key...' });
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
        this.post({ command: 'status', text: `Testing ${this.endpoints.length} Endpoints...` });
        const allIndices = this.endpoints.map((_, i) => i);
        const results = await this.doRun(currentURL, currentKey, allIndices);
        // 4. Auto-Export
        if (results && results.length > 0) {
            this.post({ command: 'status', text: 'Generating Final Report...' });
            await this.doExport(results);
        }
        this.post({ command: 'status', text: 'Workflow Complete', active: false });
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
    async doRun(baseURL, apiKey, indices) {
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
        this.post({ command: 'status', text: 'PHASE 2: Preparation...' });
        const framework = await (0, frameworkDetector_1.detectFramework)();
        const serverErr = await (0, serverManager_1.ensureServerRunning)(baseURL, framework);
        if (serverErr) {
            this.post({ command: 'error', text: serverErr });
            return [];
        }
        const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        const results = [];
        const idCache = {}; // Cache for discovered IDs
        for (const idx of indices) {
            const ep = this.endpoints[idx];
            this.post({ command: 'status', text: `AI Thinking: ${ep.path}...` });
            // Use cached ID if path has a parameter
            let currentPath = ep.path;
            const paramMatch = currentPath.match(/\{([^}]*id[^}]*)\}|:([a-zA-Z]*id[a-zA-Z]*)/i);
            if (paramMatch) {
                const paramName = paramMatch[1] || paramMatch[2];
                if (idCache[paramName]) {
                    currentPath = currentPath.replace(paramMatch[0], idCache[paramName]);
                }
            }
            const smartPath = await (0, errorExplainer_1.autoExpandUrlWithAI)(currentPath, ep.method, apiKey, ep.file);
            let body = null;
            if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
                body = await (0, errorExplainer_1.generateRequestBodyWithAI)(ep.path, ep.method, apiKey, ep.file);
            }
            this.post({ command: 'status', text: `Executing: ${ep.method} ${smartPath}...` });
            let res = await (0, requestRunner_1.runRequest)(ep, baseURL, 5000, body, smartPath, headers);
            res.passed = res.status === 200 || res.status === 201;
            let ai;
            let classification = null;
            // --- SELF-HEALING LOGIC ---
            if (!res.passed) {
                classification = this.classifyError(res.status ?? 0);
                // 1. Recover from 422 (Unprocessable Entity) using AI to fix body
                if (res.status === 422 && apiKey) {
                    this.post({ command: 'status', text: `Self-Healing 422 (Body Fix)...` });
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
                        this.post({ command: 'status', text: `Self-Healing 404...` });
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
                if (ep.method === 'GET' && Array.isArray(res.responseData)) {
                    const first = res.responseData[0];
                    if (first && first.id)
                        idCache['id'] = first.id;
                    if (first && first.uuid)
                        idCache['uuid'] = first.uuid;
                }
                else if (ep.method === 'GET' && res.responseData && res.responseData.id) {
                    idCache['id'] = res.responseData.id;
                }
            }
            results[idx] = { ...res, ai, classification };
            this.post({ command: 'partialResult', results });
        }
        this.post({ command: 'status', text: 'Done', active: false });
        return results;
    }
    getHtml() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<style>
  :root {
    --bg: #0f172a; --card: #1e293b; --accent: #6366f1; --highlight: #818cf8; --text: #f8fafc;
    --text-dim: #94a3b8; --success: #10b981; --error: #ef4444; --border: rgba(255,255,255,0.08);
  }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif; padding: 15px; font-size: 11px; margin: 0; }
  .logo { font-weight: 800; font-size: 14px; letter-spacing: 2px; color: var(--highlight); margin-bottom: 20px; text-transform: uppercase; }
  .stages { display: flex; gap: 4px; margin-bottom: 20px; }
  .stage { flex: 1; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; position: relative; }
  .stage.active { background: var(--accent); }
  .stage-lbl { position: absolute; top: 6px; font-size: 7px; font-weight: bold; color: var(--text-dim); }
  .config-box { background: var(--card); padding: 15px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .input-grp { display: flex; flex-direction: column; gap: 4px; }
  label { font-size: 9px; text-transform: uppercase; color: var(--text-dim); font-weight: 800; }
  input { background: #000; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-family: monospace; font-size: 11px; width: 100%; box-sizing: border-box; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 15px; }
  .stat { background: var(--card); border: 1px solid var(--border); padding: 8px; border-radius: 6px; text-align: center; }
  .stat b { display: block; font-size: 14px; }
  .stat span { font-size: 7px; color: var(--text-dim); text-transform: uppercase; }
  .controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  button { width: 100%; border: none; padding: 10px; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 11px; }
  #auto-btn { background: linear-gradient(90deg, #6366f1, #c084fc); color: #fff; }
  #run-btn { background: var(--accent); color: #fff; }
  #scan-btn { background: #334155; color: #fff; }
  #export-btn { background: transparent; border: 1px solid var(--accent); color: var(--accent); margin-top: 5px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .group-header { padding: 4px 10px; color: var(--highlight); font-weight: bold; font-size: 9px; margin-top: 10px; opacity: 0.7; }
  .item { background: var(--card); border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
  .item-head { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; }
  .method { font-weight: bold; font-size: 8px; min-width: 45px; text-align: center; padding: 3px; color: #fff; background: #475569; border-radius: 3px; }
  .path { font-family: monospace; flex: 1; font-size: 11px; }
  .tag { font-weight: bold; font-size: 10px; margin-left: auto; }
  .passed { color: var(--success); } .failed { color: var(--error); }
  .details { padding: 10px; border-top: 1px solid var(--border); background: rgba(0,0,0,0.15); display: none; }
  .open .details { display: block; }
  pre { background: #000; padding: 8px; border-radius: 4px; font-size: 9px; overflow-x: auto; border: 1px solid rgba(255,255,255,0.05); }
  .err-box { background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error); padding: 8px; font-size: 9px; margin-bottom: 5px; }
  #status-bar { position: fixed; bottom:0; left:0; right:0; background: var(--accent); color:#fff; padding: 4px 12px; font-size: 9px; font-weight: 800; z-index: 1000; display: none; }
</style>
</head>
<body>
  <div class="logo">APEXON <span style="font-size:8px;opacity:0.6">v0.4.3</span></div>
  <div style="font-size: 8px; color: var(--text-dim); margin-bottom: 12px; display: flex; gap: 10px;">
    <span>🔍 Auto-Discovery</span>
    <span>🧪 Smart Test Cases</span>
    <span>🧠 AI Explainer</span>
  </div>
  <div class="stages">
    <div id="stg-1" class="stage active"><span class="stage-lbl">DISCOVER</span></div>
    <div id="stg-2" class="stage"><span class="stage-lbl">PREPARE</span></div>
    <div id="stg-3" class="stage"><span class="stage-lbl">EXECUTE</span></div>
    <div id="stg-4" class="stage"><span class="stage-lbl">REPORT</span></div>
  </div>
  
  <div class="config-box" style="padding:10px; opacity:0.6">
    <div class="grid-2">
      <div class="input-grp"><label>Base URL</label><input id="url-in" type="text" placeholder="Auto-Fill..."></div>
      <div class="input-grp"><label>API Key</label><input id="key-in" type="password" placeholder="sk-..."></div>
    </div>
  </div>
  <div class="summary">
    <div class="stat"><b id="s-total">0</b><span>Selected</span></div>
    <div class="stat"><b id="s-passed" style="color:var(--success)">0</b><span>Passed</span></div>
    <div class="stat"><b id="s-failed" style="color:var(--error)">0</b><span>Failed</span></div>
    <div class="stat"><b id="s-avg">0</b><span>ms Avg</span></div>
  </div>
  <div class="controls">
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px">
      <button id="scan-btn" style="background:var(--card); border:1px solid var(--accent); color:var(--accent)">1. SCAN</button>
      <button id="auto-btn" style="background:var(--accent); color:#fff">2. TEST ALL</button>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px">
      <button id="run-btn" style="background: #334155; color: #fff;">EXECUTE SELECTED</button>
      <button id="stop-btn" style="background:#ef4444; color:#fff; opacity:0.8">STOP</button>
    </div>
  </div>
  <div class="list" id="list"></div>
  <div id="status-bar">Ready</div>
<script>
  (function() {
    const vscode = acquireVsCodeApi();
    const urlIn = document.getElementById('url-in');
    const keyIn = document.getElementById('key-in');
    const stBar = document.getElementById('status-bar');
    const list = document.getElementById('list');
    let endpoints = [];
    let results = [];

    function save() {
      vscode.postMessage({ command: 'saveConfig', baseURL: urlIn.value, apiKey: keyIn.value });
    }
    urlIn.addEventListener('change', save);
    keyIn.addEventListener('change', save);

    document.getElementById('auto-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'autoPilot', baseURL: urlIn.value, apiKey: keyIn.value });
    });

    document.getElementById('scan-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'autoDiscover' });
    });

    document.getElementById('stop-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'stop' });
      list.innerHTML = '<div style="text-align:center;padding:20px;color:gray">Discovery complete. Ready to execute.</div>';
    });

    document.getElementById('run-btn').addEventListener('click', function() {
      const idxs = [];
      document.querySelectorAll('.chk:checked').forEach(c => idxs.push(parseInt(c.dataset.idx)));
      vscode.postMessage({ command: 'run', baseURL: urlIn.value, apiKey: keyIn.value, indices: idxs });
    });


    window.addEventListener('message', event => {
      const data = event.data;
      switch (data.command) {
        case 'updateConfig':
          urlIn.value = data.baseURL || '';
          keyIn.value = data.apiKey || '';
          break;
        case 'status':
          stBar.innerText = data.text;
          stBar.style.display = data.active === false ? 'none' : 'block';
          if (data.text.includes('Discovery')) setStage(1);
          if (data.text.includes('Preparing')) setStage(2);
          if (data.text.includes('Executing')) setStage(3);
          break;
        case 'scanResult':
          endpoints = data.endpoints || [];
          results = [];
          setStage(1);
          render();
          break;
        case 'partialResult':
          results = data.results || [];
          setStage(4);
          render();
          break;
        case 'error':
          alert(data.text);
          break;
      }
    });

    function setStage(idx) {
      document.querySelectorAll('.stage').forEach((s, i) => s.classList.toggle('active', (i+1) <= idx));
    }

    function render() {
      if (!endpoints || !endpoints.length) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:gray">Discovery complete. Ready to execute.</div>';
        return;
      }
      const grps = {};
      let p=0, f=0, tt=0, count=0;
      endpoints.forEach((ep, i) => {
        const file = ep.file.split(/[\\\\/]/).pop() || 'Unknown';
        if (!grps[file]) grps[file] = [];
        grps[file].push({ep, i});
      });

      let html = '';
      Object.keys(grps).forEach(fN => {
        html += '<div class="group-header">' + fN + '</div>';
        grps[fN].forEach(({ ep, i }) => {
          const res = results[i];
          if (res?.passed) p++; else if (res) f++;
          if (res?.responseTime) { tt += res.responseTime; count++; }

          html += '<div class="item" id="i-' + i + '">' +
            '<div class="item-head">' +
              '<input type="checkbox" class="chk" data-idx="' + i + '" checked onclick="event.stopPropagation(); updateSum()">' +
              '<div style="flex:1; display:flex; align-items:center; gap:10px" onclick="document.getElementById(\\'i-' + i + '\\').classList.toggle(\\'open\\')">' +
                '<span class="method">' + ep.method + '</span>' +
                '<span class="path">' + ep.path + '</span>' +
                '<span class="tag ' + (res?.passed ? 'passed' : (res ? 'failed' : '')) + '">' + (res ? (res.status || 'FAIL') : '') + '</span>' +
                (res?.responseTime ? '<span style="font-size:8px;color:gray">' + res.responseTime + 'ms</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="details">' +
              (res?.classification ? '<div class="err-box"><b style="color:var(--error)">' + res.classification.reason + '</b><br>👉 ' + res.classification.fix + '</div>' : '') +
              '<div style="font-size:8px;color:gray;margin-bottom:4px">Target: ' + (res?.fullUrl || '--') + '</div>' +
              '<pre>' + JSON.stringify(res?.responseData || {}, null, 2) + '</pre>' +
              (res?.ai ? '<div style="background:rgba(99,102,241,0.1);padding:8px;border-radius:4px;margin-top:8px"><b>AI INSIGHT</b><br>' + res.ai.why + '<br><i>' + res.ai.fix + '</i></div>' : '') +
            '</div>' +
          '</div>';
        });
      });
      list.innerHTML = html;
      document.getElementById('s-passed').innerText = p;
      document.getElementById('s-failed').innerText = f;
      document.getElementById('s-avg').innerText = count > 0 ? Math.round(tt/count) : 0;
      updateSum();
    }

    window.updateSum = function() {
      document.getElementById('s-total').innerText = document.querySelectorAll('.chk:checked').length;
    };
  })();
</script>
</body>
</html>`;
    }
}
exports.ApexonDashboard = ApexonDashboard;
//# sourceMappingURL=webviewPanel.js.map