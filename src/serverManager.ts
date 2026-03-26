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

/** Ensures the server is running. Spawns it if necessary. */
export async function ensureServerRunning(
  baseURL: string,
  framework: Framework
): Promise<string | null> {
  // Check if ALREADY up - Be quiet here
  if (await isServerUp(baseURL)) return null;

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
  const deadline = Date.now() + 15_000;
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
export function killServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = undefined;
  }
}
