import * as vscode from 'vscode';
import { scanWorkspace, Endpoint } from './scanner';
import { detectFramework } from './frameworkDetector';
import { ensureServerRunning } from './serverManager';
import { runRequest, TestResult } from './requestRunner';
import { explainWithAI, AIAnalysis, generateRequestBodyWithAI, autoExpandUrlWithAI } from './errorExplainer';

function getConfig<T>(key: string): T {
  return vscode.workspace.getConfiguration('apexon').get<T>(key) as T;
}

async function updateConfig(key: string, value: any) {
  await vscode.workspace.getConfiguration('apexon').update(key, value, vscode.ConfigurationTarget.Global);
}

export class ApexonDashboard implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _panel?: vscode.WebviewPanel;
  private endpoints: Endpoint[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage(m => this.handleMessage(m));
    this.syncConfig();
    this.doScan();
  }

  public createOrShowFullPanel() {
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

  private post(msg: any) {
    this._view?.webview.postMessage(msg);
    this._panel?.webview.postMessage(msg);
  }

  private syncConfig() {
    this.post({
      command: 'updateConfig',
      baseURL: getConfig('baseURL'),
      apiKey: getConfig('apiKey')
    });
  }

  private async handleMessage(msg: any) {
    switch (msg.command) {
      case 'scan': await this.doScan(msg.baseURL); break;
      case 'run':  await this.doRun(msg.baseURL, msg.apiKey, msg.indices); break;
      case 'autoPilot': await this.doAutoPilot(msg.baseURL, msg.apiKey); break;
      case 'export': await this.doExport(msg.results); break;
      case 'saveConfig':
        await updateConfig('baseURL', msg.baseURL);
        await updateConfig('apiKey', msg.apiKey);
        break;
    }
  }

  private async doScan(baseURL?: string) {
    this.post({ command: 'status', text: 'PHASE 1: API Discovery...' });
    this.endpoints = await scanWorkspace(baseURL); 
    if (this.endpoints.length === 0) {
      this.post({ command: 'error', text: 'API structure not detected' });
      return;
    }
    const framework = await detectFramework();
    this.post({ command: 'scanResult', endpoints: this.endpoints, framework });
  }

  private async doAutoPilot(baseURL: string, apiKey: string) {
    await this.doScan(baseURL);
    if (this.endpoints.length > 0) {
      const allIndices = this.endpoints.map((_, i) => i);
      await this.doRun(baseURL, apiKey, allIndices);
    }
  }

  private async doExport(results: any[]) {
    if (!results || results.length === 0) return vscode.window.showErrorMessage('No test results to export.');
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(results, null, 2),
      language: 'json'
    });
    await vscode.window.showTextDocument(doc);
  }

  private classifyError(status: number): { reason: string; fix: string } {
    switch (status) {
      case 400: return { reason: 'Bad Request', fix: 'Check payload' };
      case 401: return { reason: 'Unauthorized', fix: 'Invalid Key' };
      case 403: return { reason: 'Forbidden', fix: 'Check permissions' };
      case 404: return { reason: 'Not Found', fix: 'Target path missing' };
      case 500: return { reason: 'Server Error', fix: 'Backend crashed' };
      default: return { reason: 'HTTP '+status, fix: 'Check body' };
    }
  }

  private async doRun(baseURL: string, apiKey: string, indices: number[]) {
    if (!indices?.length) return this.post({ command: 'error', text: 'No endpoints selected.' });
    if (!baseURL) return this.post({ command: 'error', text: 'Base URL missing.' });
    if (!apiKey) return this.post({ command: 'error', text: 'API Key missing.' });

    this.post({ command: 'status', text: 'PHASE 2: Preparation...' });
    const framework = await detectFramework();
    const serverErr = await ensureServerRunning(baseURL, framework);
    if (serverErr) return this.post({ command: 'error', text: serverErr });

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const results: (TestResult & { ai?: AIAnalysis; classification?: any })[] = [];
    
    for (const idx of indices) {
      const ep = this.endpoints[idx];
      this.post({ command: 'status', text: `AI Thinking: ${ep.path}...` });
      const smartPath = await autoExpandUrlWithAI(ep.path, ep.method, apiKey, ep.file);
      let body: any = null;
      if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
        body = await generateRequestBodyWithAI(ep.path, ep.method, apiKey, ep.file);
      }
      this.post({ command: 'status', text: `Executing: ${ep.method} ${smartPath}...` });
      const res = await runRequest(ep, baseURL, 5000, body, smartPath, headers);
      res.passed = res.status === 200 || res.status === 201;
      
      let ai: AIAnalysis | undefined;
      let classification: any = null;
      if (!res.passed) {
        classification = this.classifyError(res.status ?? 0);
        if (apiKey) {
          ai = await explainWithAI(smartPath, ep.method, res.requestBody, res.responseData, res.status, apiKey);
          if (res.status === 404 && ai?.newPath && ai.newPath !== smartPath) {
            this.post({ command: 'status', text: `Self-Healing 404...` });
            const retryRes = await runRequest(ep, baseURL, 5000, body, ai.newPath, headers);
            if (retryRes.status === 200 || retryRes.status === 201) {
              results[idx] = { ...retryRes, passed: true, ai: { ...ai, why: 'Fixed prefix automatically', fix: 'Healed' } };
              this.post({ command: 'partialResult', results });
              continue; 
            }
          }
        }
      }
      results[idx] = { ...res, ai, classification };
      this.post({ command: 'partialResult', results });
    }
    this.post({ command: 'status', text: 'Done', active: false });
  }

  private getHtml() {
    return /* html */`<!DOCTYPE html>
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
  <div class="logo">APEXON <span style="font-size:8px;opacity:0.6">v0.4.1</span></div>
  <div class="stages">
    <div id="stg-1" class="stage active"><span class="stage-lbl">DISCOVER</span></div>
    <div id="stg-2" class="stage"><span class="stage-lbl">PREPARE</span></div>
    <div id="stg-3" class="stage"><span class="stage-lbl">EXECUTE</span></div>
    <div id="stg-4" class="stage"><span class="stage-lbl">REPORT</span></div>
  </div>
  <div class="config-box">
    <div class="grid-2">
      <div class="input-grp"><label>Base URL *</label><input id="url-in" type="text" placeholder="http://localhost:8080"></div>
      <div class="input-grp"><label>API Key *</label><input id="key-in" type="password" placeholder="sk-..."></div>
    </div>
  </div>
  <div class="summary">
    <div class="stat"><b id="s-total">0</b><span>Selected</span></div>
    <div class="stat"><b id="s-passed" style="color:var(--success)">0</b><span>Passed</span></div>
    <div class="stat"><b id="s-failed" style="color:var(--error)">0</b><span>Failed</span></div>
    <div class="stat"><b id="s-avg">0</b><span>ms Avg</span></div>
  </div>
  <div class="controls">
    <button id="auto-btn">✨ RUN COMPLETE WORKFLOW</button>
    <div style="display:flex; gap:8px"><button id="scan-btn" style="flex:1">Discover</button><button id="run-btn" style="flex:1">Execute</button></div>
    <button id="export-btn">⬇️ EXPORT JSON REPORT</button>
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
      save();
      vscode.postMessage({ command: 'autoPilot', baseURL: urlIn.value, apiKey: keyIn.value });
    });

    document.getElementById('scan-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'scan', baseURL: urlIn.value });
    });

    document.getElementById('run-btn').addEventListener('click', function() {
      const idxs = [];
      document.querySelectorAll('.chk:checked').forEach(c => idxs.push(parseInt(c.dataset.idx)));
      vscode.postMessage({ command: 'run', baseURL: urlIn.value, apiKey: keyIn.value, indices: idxs });
    });

    document.getElementById('export-btn').addEventListener('click', function() {
      vscode.postMessage({ command: 'export', results: results });
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
