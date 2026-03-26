import * as vscode from 'vscode';
import { ApexonDashboard } from './webviewPanel';

export function activate(context: vscode.ExtensionContext) {
  // Create the singleton instance of the dashboard engine
  const dashboard = new ApexonDashboard(context.extensionUri);

  // Register the Sidebar View provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'apexon.dashboard', // Matches package.json view ID
      dashboard
    )
  );

  // Register command to force-open a full panel if needed
  context.subscriptions.push(
    vscode.commands.registerCommand('apexon.openPanel', () => {
      dashboard.createOrShowFullPanel();
    })
  );
}

export function deactivate() {
  // Graceful cleanup happens internally or via VS Code lifecycle
}
