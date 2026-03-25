import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type Framework = 'FastAPI' | 'Flask' | 'Express' | 'Vapor' | 'Unknown';

/** Detects the framework used in the project by checking config files and dependencies */
export async function detectFramework(): Promise<Framework> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return 'Unknown';
  
  const root = folders[0].uri.fsPath;

  // 1. Vapor: Look for Package.swift containing 'vapor'
  const packageSwift = path.join(root, 'Package.swift');
  if (fs.existsSync(packageSwift)) {
    const content = fs.readFileSync(packageSwift, 'utf8');
    if (content.toLowerCase().includes('vapor')) return 'Vapor';
  }

  // 2. Python (FastAPI/Flask): Check requirements.txt or search source for imports
  const reqTxt = path.join(root, 'requirements.txt');
  if (fs.existsSync(reqTxt)) {
    const content = fs.readFileSync(reqTxt, 'utf8').toLowerCase();
    if (content.includes('fastapi')) return 'FastAPI';
    if (content.includes('flask')) return 'Flask';
  }

  // 3. Node.js (Express): Check package.json dependencies
  const pkgJson = path.join(root, 'package.json');
  if (fs.existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['express']) return 'Express';
    } catch {
      // Malformed JSON - skip
    }
  }

  return 'Unknown';
}
