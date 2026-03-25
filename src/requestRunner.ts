import axios, { AxiosError } from 'axios';
import { Endpoint } from './scanner';

export interface TestResult {
  endpoint: Endpoint;
  status: number | null;
  statusText: string;
  durationMs: number;
  passed: boolean;
  errorCode: string | null; // e.g., 'TIMEOUT' | 'NETWORK'
}

const SAMPLE_BODY = { name: 'test', value: 'sample' };

/** Normalize path with placeholder values (e.g., :id -> 1) */
function normalizePath(p: string): string {
  return p
    .replace(/\{userId\}/g, '1')
    .replace(/\{slug\}/g, 'test')
    .replace(/\{[^}]+\}/g, '1')   // Any remaining {param}
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '1'); // :param style
}

/** Executes a single request and measures performance */
export async function runRequest(
  endpoint: Endpoint,
  baseURL: string,
  apiKey: string,
  timeoutMs: number
): Promise<TestResult> {
  const url = baseURL.replace(/\/$/, '') + normalizePath(endpoint.path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);

  const start = Date.now();
  try {
    const response = await axios.request({
      method: endpoint.method.toLowerCase(),
      url,
      headers,
      data: needsBody ? SAMPLE_BODY : undefined,
      timeout: timeoutMs,
      validateStatus: () => true, // Ensure we get back the status for validation
    });

    const durationMs = Date.now() - start;
    const passed = response.status >= 200 && response.status <= 299;
    
    return {
      endpoint,
      status: response.status,
      statusText: response.statusText || String(response.status),
      durationMs,
      passed,
      errorCode: null,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const axiosErr = err as AxiosError;
    const errorCode = axiosErr.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK';

    return {
      endpoint,
      status: null,
      statusText: errorCode,
      durationMs,
      passed: false,
      errorCode,
    };
  }
}
