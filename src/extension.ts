import * as vscode from 'vscode';
import { ApiTesterPanel } from './webviewPanel';

let panel: ApiTesterPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Command to open the API testing dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('apexon.openPanel', () => {
      // Reuse existing panel if active, otherwise create new
      if (panel) {
        panel.reveal();
      } else {
        panel = new ApiTesterPanel(context);
        panel.onDispose(() => { panel = undefined; });
      }
    })
  );
}

export function deactivate() {
  // Graceful cleanup: stop server and kill panel
  panel?.dispose();
}
