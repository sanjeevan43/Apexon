"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRequest = runRequest;
const axios_1 = __importDefault(require("axios"));
const SAMPLE_BODY = { name: 'test', value: 'sample' };
/** Normalize path with placeholder values (e.g., :id -> 1) */
function normalizePath(p) {
    return p
        .replace(/\{userId\}/g, '1')
        .replace(/\{slug\}/g, 'test')
        .replace(/\{[^}]+\}/g, '1') // Any remaining {param}
        .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '1'); // :param style
}
/** Executes a single request and measures performance */
async function runRequest(endpoint, baseURL, apiKey, timeoutMs) {
    const url = baseURL.replace(/\/$/, '') + normalizePath(endpoint.path);
    const headers = {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
    const needsBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);
    const start = Date.now();
    try {
        const response = await axios_1.default.request({
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
    }
    catch (err) {
        const durationMs = Date.now() - start;
        const axiosErr = err;
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
//# sourceMappingURL=requestRunner.js.map