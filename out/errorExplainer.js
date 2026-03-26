"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRequestBodyWithAI = generateRequestBodyWithAI;
exports.explainWithAI = explainWithAI;
exports.autoExpandUrlWithAI = autoExpandUrlWithAI;
const axios_1 = __importDefault(require("axios"));
/**
 * Uses AI to generate a realistic JSON body for a given endpoint.
 */
async function generateRequestBodyWithAI(endpoint, method, apiKey, sourceFile) {
    if (!apiKey)
        return { id: 1, sample: 'no-api-key' };
    const prompt = `
    You are an API testing expert. Generate a realistic JSON request body for this endpoint:
    Method: ${method}
    Path: ${endpoint}
    Defined in: ${sourceFile || 'unknown file'}

    Context: Consider the likely schema based on the path and file name.
    Return ONLY the raw JSON object. No extra text.
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-1106',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 8000
        });
        const content = res.data.choices[0].message.content.trim();
        return JSON.parse(content.replace(/^```json|```$/g, ''));
    }
    catch (err) {
        console.error('AI Body Gen failed:', err.message);
        return { name: "Test Item", status: "active" }; // Fallback
    }
}
/**
 * Uses AI to analyze an API error and provide structured feedback.
 */
async function explainWithAI(endpoint, method, requestData, response, status, apiKey) {
    if (!apiKey) {
        return {
            why: 'AI key missing.',
            wrong: 'The extension requires an API key for AI-powered insights.',
            fix: 'Add your API key in the extension settings (apexon.apiKey).'
        };
    }
    const prompt = `
    Analyze this API error:
    Endpoint: ${method} ${endpoint}
    Request Body: ${JSON.stringify(requestData)}
    Response Status: ${status}
    Response Body: ${JSON.stringify(response)}

    Return a JSON object with:
    {
      "why": "Briefly why it happened",
      "wrong": "Detailed what is wrong",
      "fix": "Actionable how to fix it",
      "newPath": "If 404, suggested correct path including possible missing prefixes like /api or /v1. Otherwise null."
    }
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-1106',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        const content = res.data.choices[0].message.content;
        return JSON.parse(content);
    }
    catch (err) {
        return {
            why: 'AI analysis failed.',
            wrong: status ? `Received HTTP ${status}` : 'Network error occurred.',
            fix: 'Check your internet connection and API key permissions.'
        };
    }
}
/**
 * Uses AI to intelligently expand a path with realistic parameters (path and query).
 * Example: /users/{id} -> /users/42?include_profile=true
 */
async function autoExpandUrlWithAI(path, method, apiKey, sourceFile) {
    if (!apiKey)
        return path.replace(/\{[^}]+\}/g, '1').replace(/:[a-zA-Z0-9_]+/g, '1');
    const prompt = `
    Suggest a realistic test URL for this endpoint:
    Method: ${method}
    Base Path: ${path}
    Defined in: ${sourceFile || 'unknown file'}

    Context: If the file is in a folder like 'routers/auth.py', the prefix might be '/auth'.
    Return ONLY the relative path string starting with /. No markdown.
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-1106',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 5000
        });
        const expanded = res.data.choices[0].message.content.trim();
        return expanded.startsWith('/') ? expanded : '/' + expanded;
    }
    catch {
        return path.replace(/\{[^}]+\}/g, '1').replace(/:[a-zA-Z0-9_]+/g, '1');
    }
}
//# sourceMappingURL=errorExplainer.js.map