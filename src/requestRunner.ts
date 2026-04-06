import axios, { AxiosError } from 'axios';
import { Endpoint } from './scanner';

export interface TestResult {
  endpoint: Endpoint;
  status: number | null;
  statusText: string;
  durationMs: number;
  passed: boolean;
  errorCode: string | null;
  requestBody: any;
  requestHeaders: any; // NEW
  responseData: any;
  responseHeaders: any; // NEW
  fullUrl: string;
}

/** Normalize path - no longer using hardcoded defaults like '1' to avoid fake testing */
function normalizePath(p: string): string {
  return p;
}

/** Executes a single request and measures performance */
export async function runRequest(
  endpoint: Endpoint,
  baseURL: string,
  timeoutMs: number,
  requestBody?: any,
  overriddenPath?: string,
  extraHeaders?: Record<string, string> // NEW
): Promise<TestResult> {
  const path = overriddenPath || normalizePath(endpoint.path);
  const url = baseURL.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders // Merge user-provided headers
  };
  
  const actualBody = requestBody || (['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? { id: 1 } : null);

  const start = Date.now();
  try {
    const response = await axios.request({
      method: endpoint.method.toLowerCase(),
      url,
      headers,
      data: actualBody,
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    return {
      endpoint,
      status: response.status,
      statusText: response.statusText || String(response.status),
      durationMs: Date.now() - start,
      passed: response.status >= 200 && response.status <= 299,
      errorCode: null,
      requestBody: actualBody,
      requestHeaders: headers,
      responseData: response.data,
      responseHeaders: response.headers,
      fullUrl: url,
    };
  } catch (err) {
    const axiosErr = err as AxiosError;
    const errorCode = axiosErr.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK';

    return {
      endpoint,
      status: null,
      statusText: errorCode,
      durationMs: Date.now() - start,
      passed: false,
      errorCode,
      requestBody: actualBody,
      requestHeaders: headers,
      responseData: axiosErr.response?.data || null,
      responseHeaders: axiosErr.response?.headers || null,
      fullUrl: url,
    };
  }
}
