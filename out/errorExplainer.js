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
    You are an API testing expert. Generate a realistic, valid JSON request body for this endpoint:
    Method: ${method}
    Path: ${endpoint}
    Source File Context: ${sourceFile || 'unknown'}

    Requirements:
    1. Infer fields from the path (e.g., /users likely needs 'username', 'email').
    2. Use standard types (strings for names, numbers for amounts).
    3. If it looks like an Auth endpoint, include 'username' and 'password'.
    4. Return ONLY a single JSON object.

    JSON Structure:
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        const content = res.data.choices[0].message.content.trim();
        return JSON.parse(content);
    }
    catch (err) {
        console.error('AI Body Gen failed:', err.message);
        return { name: "Test Item", status: "active" };
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
    Request Body Sent: ${JSON.stringify(requestData)}
    Response Status Received: ${status}
    Response Body Received: ${JSON.stringify(response)}

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
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 12000
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
    Context: ${sourceFile || 'unknown'}

    Requirements:
    1. If there are path parameters like {id} or :id, replace them with '1' or a realistic value.
    2. Add realistic query parameters if applicable (e.g., ?limit=10).
    3. Return ONLY the relative path string starting with /.
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 6000
        });
        const expanded = res.data.choices[0].message.content.trim();
        return expanded.startsWith('/') ? expanded : '/' + expanded;
    }
    catch {
        return path.replace(/\{[^}]+\}/g, '1').replace(/:[a-zA-Z0-9_]+/g, '1');
    }
}
//# sourceMappingURL=errorExplainer.js.map