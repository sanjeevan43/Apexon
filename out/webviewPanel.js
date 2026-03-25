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
exports.ApiTesterPanel = void 0;
const vscode = __importStar(require("vscode"));
const scanner_1 = require("./scanner");
const frameworkDetector_1 = require("./frameworkDetector");
const serverManager_1 = require("./serverManager");
const requestRunner_1 = require("./requestRunner");
const errorExplainer_1 = require("./errorExplainer");
/** Accesses user configuration with a safe fallback */
function getConfig(key) {
    return vscode.workspace.getConfiguration('apexon').get(key);
}
class ApiTesterPanel {
    constructor(context) {
        this.endpoints = [];
        this.panel = vscode.window.createWebviewPanel('apexon', 'Apexon Dashboard', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), undefined, context.subscriptions);
        this.panel.onDidDispose(() => {
            (0, serverManager_1.killServer)();
            this.disposeCallback?.();
        }, null, context.subscriptions);
    }
    reveal() {
        this.panel.reveal();
    }
    onDispose(cb) {
        this.disposeCallback = cb;
    }
    dispose() {
        this.panel.dispose();
    }
    post(msg) {
        this.panel.webview.postMessage(msg);
    }
    async handleMessage(msg) {
        switch (msg.command) {
            case 'scan':
                await this.doScan();
                break;
            case 'run':
                await this.doRun(this.endpoints);
                break;
            case 'runSingle': {
                if (!this.endpoints.length) {
                    this.post({ command: 'error', text: 'No endpoints detected. Please Scan first.' });
                    return;
                }
                const items = this.endpoints.map((e, i) => ({
                    label: `${e.method} ${e.path}`,
                    index: i,
                }));
                const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Pick an endpoint to test individually' });
                if (pick)
                    await this.doRun([this.endpoints[pick.index]]);
                break;
            }
        }
    }
    async doScan() {
        this.post({ command: 'status', text: 'Scanning workspace…' });
        this.endpoints = await (0, scanner_1.scanWorkspace)();
        const framework = await (0, frameworkDetector_1.detectFramework)();
        this.post({
            command: 'scanResult',
            count: this.endpoints.length,
            framework,
        });
    }
    async doRun(targets) {
        if (!targets.length) {
            this.post({ command: 'error', text: 'No endpoints to reach. Run Scan first.' });
            return;
        }
        const baseURL = getConfig('baseURL');
        if (!baseURL) {
            this.post({ command: 'error', text: 'apexon.baseURL is not configured.' });
            return;
        }
        const apiKey = getConfig('apiKey');
        const timeout = getConfig('timeout') ?? 5000;
        this.post({ command: 'status', text: 'Ensuring server is up…' });
        const framework = await (0, frameworkDetector_1.detectFramework)();
        const serverErr = await (0, serverManager_1.ensureServerRunning)(baseURL, framework);
        if (serverErr) {
            this.post({ command: 'error', text: serverErr });
            return;
        }
        this.post({ command: 'status', text: `Executing ${targets.length} request(s)…` });
        const results = [];
        for (const ep of targets) {
            const result = await (0, requestRunner_1.runRequest)(ep, baseURL, apiKey, timeout);
            results.push(result);
        }
        const lines = [];
        let passed = 0;
        for (const r of results) {
            const icon = r.passed ? '✔' : '✖';
            const label = r.passed ? 'OK' : 'ERROR';
            const statusStr = r.status !== null ? `${r.status} ${label}` : r.statusText;
            lines.push(`${icon} ${r.endpoint.method.padEnd(5)} ${r.endpoint.path.padEnd(20)} ${statusStr.padEnd(12)} (${r.durationMs}ms)`);
            if (!r.passed) {
                lines.push(`  → Reason: ${(0, errorExplainer_1.explain)(r.status, r.errorCode)}`);
            }
            else {
                passed++;
            }
        }
        lines.push('');
        lines.push('Summary:');
        lines.push(`Total: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);
        this.post({ command: 'results', lines });
    }
    getHtml() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg-main: #0a0b10;
    --accent: #4f46e5;
    --accent-hover: #6366f1;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --card-bg: rgba(30, 41, 59, 0.4);
    --border: rgba(255, 255, 255, 0.1);
    --success: #10b981;
    --error: #ef4444;
    --warning: #f59e0b;
  }

  body {
    background-color: var(--bg-main);
    color: var(--text-primary);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 100vh;
  }

  .glass {
    background: var(--card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
  }

  .branding {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .branding h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }

  .controls {
    display: flex;
    gap: 10px;
  }

  button {
    background: var(--accent);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  button:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  button:active {
    transform: translateY(0);
  }

  .status-line {
    padding: 12px 20px;
    font-size: 13px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pulse {
    width: 8px;
    height: 8px;
    background: var(--accent);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
  }

  main {
    flex: 1;
    overflow: auto;
    padding: 20px;
  }

  .output-container {
    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .line-success { color: var(--success); }
  .line-error { color: var(--error); }
  .line-reason { color: var(--warning); opacity: 0.9; }
  .line-summary { 
    color: var(--text-primary); 
    font-weight: bold; 
    border-top: 1px solid var(--border);
    margin-top: 12px;
    padding-top: 12px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    text-align: center;
    gap: 12px;
  }

  .empty-state svg {
    width: 48px;
    height: 48px;
    opacity: 0.2;
  }
</style>
</head>
<body>
  <header class="glass">
    <div class="branding">
      <h1>APEXON</h1>
    </div>
    <div class="controls">
      <button id="btnScan">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Scan
      </button>
      <button id="btnRun">
        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Run All
      </button>
      <button id="btnRunSingle">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20m10-10H2"/></svg>
        Targeted
      </button>
    </div>
  </header>

  <div id="status" class="status-line glass" style="display: none;">
    <div class="pulse"></div>
    <span id="statusText">Ready to scan...</span>
  </div>

  <main class="glass">
    <div id="output" class="output-container">
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
        <p>No endpoints detected yet.<br>Click <b>Scan</b> to analyze your workspace.</p>
      </div>
    </div>
  </main>

<script>
  const vscode = acquireVsCodeApi();
  const statusContainer = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const outputEl = document.getElementById('output');

  document.getElementById('btnScan').onclick = () => vscode.postMessage({ command: 'scan' });
  document.getElementById('btnRun').onclick = () => vscode.postMessage({ command: 'run' });
  document.getElementById('btnRunSingle').onclick = () => vscode.postMessage({ command: 'runSingle' });

  window.addEventListener('message', ({ data }) => {
    switch (data.command) {
      case 'status':
        statusContainer.style.display = 'flex';
        statusText.textContent = data.text;
        break;
      case 'error':
        statusContainer.style.display = 'flex';
        statusText.textContent = 'Operational fault detected';
        outputEl.innerHTML = '<span class="line-error">✖ ' + esc(data.text) + '</span>';
        break;
      case 'scanResult':
        statusContainer.style.display = 'flex';
        statusText.textContent = 'Scan complete';
        outputEl.innerHTML = '<div style="color: var(--text-secondary)">Found <b>' + data.count + '</b> endpoint(s) mapped via <b>' + data.framework + '</b> logic.</div>';
        break;
      case 'results':
        statusContainer.style.display = 'flex';
        statusText.textContent = 'Execution finished';
        outputEl.innerHTML = data.lines.map(line => {
          if (line.startsWith('✔')) return '<span class="line-success">' + esc(line) + '</span>';
          if (line.startsWith('✖')) return '<span class="line-error">' + esc(line) + '</span>';
          if (line.startsWith('  →')) return '<span class="line-reason">' + esc(line) + '</span>';
          if (line.startsWith('Summary') || line.startsWith('Total')) return '<div class="line-summary">' + esc(line) + '</div>';
          return esc(line);
        }).join('<br>');
        break;
    }
  });

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
</script>
</body>
</html>`;
    }
}
exports.ApiTesterPanel = ApiTesterPanel;
//# sourceMappingURL=webviewPanel.js.map