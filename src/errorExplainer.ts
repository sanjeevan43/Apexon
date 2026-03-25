/** Explains status codes or network errors in a human-readable format */
const EXPLANATIONS: Record<number | string, string> = {
  400: 'Invalid input or missing required fields in the request body',
  401: 'API key missing, expired, or invalid — check apiTester.apiKey',
  403: 'Access denied — endpoint requires elevated permissions',
  404: 'Endpoint path not found — verify the route exists and path is correct',
  405: 'HTTP method not allowed for this route',
  422: 'Unprocessable entity — request body failed server-side validation',
  500: 'Server-side error or crash — check server logs',
  503: 'Server unavailable or still starting up',
  TIMEOUT: 'Server did not respond within the configured timeout',
  NETWORK: 'Could not reach server — verify baseURL and that the server is running',
};

/** High-level error decoding engine */
export function explain(status: number | null, errorCode: string | null): string {
  if (errorCode) return EXPLANATIONS[errorCode] ?? 'Unknown network error';
  if (status !== null) {
    return EXPLANATIONS[status] ?? `Unexpected HTTP status ${status}`;
  }
  return 'Unknown error';
}
