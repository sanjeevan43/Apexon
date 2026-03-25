import * as cp from 'child_process';
import * as vscode from 'vscode';
import axios from 'axios';
import { Framework } from './frameworkDetector';

/** Framework-specific start commands */
const START_COMMANDS: Record<string, [string, string[]]> = {
  FastAPI: ['uvicorn', ['main:app', '--reload']],
  Flask:   ['flask',   ['run']],
  Express: ['npm',     ['start']],
  Vapor:   ['swift',   ['run']],
};

// Global process handle to kill on deactivation
let serverProcess: cp.ChildProcess | undefined;

/** Checks if the server is already running by pinging baseURL or baseURL/health */
async function isServerUp(baseURL: string): Promise<boolean> {
  try {
    const url = baseURL.replace(/\/$/, '');
    await axios.get(`${url}/health`, { timeout: 1000 });
    return true;
  } catch {
    try {
      await axios.get(baseURL, { timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }
}

/** Ensures the server is running. Spawns it if necessary and polls health. */
export async function ensureServerRunning(
  baseURL: string,
  framework: Framework
): Promise<string | null> {
  // Return early if server is already reachable
  if (await isServerUp(baseURL)) return null;

  const startArgs = START_COMMANDS[framework];
  if (!startArgs) {
    return `Server not running and framework "${framework}" has no known start command. Please start it manually.`;
  }

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // Non-interactive spawn to allow terminal-based log viewing if needed
  serverProcess = cp.spawn(startArgs[0], startArgs[1], {
    cwd: root,
    shell: true,
    stdio: 'ignore', // Avoid cluttering the VS Code console
  });

  // Polling every 500ms, timeout @ 10 seconds
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    if (await isServerUp(baseURL)) return null;
  }

  return `Server did not respond within 10 seconds. Check that "${startArgs[0]} ${startArgs[1].join(' ')}" starts correctly.`;
}

/** Terminates the spawned server process if it exists */
export function killServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = undefined;
  }
}
