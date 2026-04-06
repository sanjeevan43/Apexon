"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRequest = runRequest;
const axios_1 = __importDefault(require("axios"));
/** Normalize path - no longer using hardcoded defaults like '1' to avoid fake testing */
function normalizePath(p) {
    return p;
}
/** Executes a single request and measures performance */
async function runRequest(endpoint, baseURL, timeoutMs, requestBody, overriddenPath, extraHeaders // NEW
) {
    const path = overriddenPath || normalizePath(endpoint.path);
    const url = baseURL.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...extraHeaders // Merge user-provided headers
    };
    const actualBody = requestBody || (['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? { id: 1 } : null);
    const start = Date.now();
    try {
        const response = await axios_1.default.request({
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
    }
    catch (err) {
        const axiosErr = err;
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
//# sourceMappingURL=requestRunner.js.map