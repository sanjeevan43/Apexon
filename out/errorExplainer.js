"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRequestBodyWithAI = generateRequestBodyWithAI;
exports.explainWithAI = explainWithAI;
exports.autoExpandUrlWithAI = autoExpandUrlWithAI;
exports.generateOpenAPISpecWithAI = generateOpenAPISpecWithAI;
const fs = __importStar(require("fs"));
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
    1. Infer fields from the path AND source code context.
    2. Look for Pydantic models, TypeScript interfaces, or JSON schemas in the context.
    3. Use standard types (strings for names, numbers for amounts).
    4. If it looks like an Auth endpoint, include 'username' and 'password'.
    5. Return ONLY a single JSON object.
    6. Ensure all required fields for a 201 Created response are present.

    Source Code Context:
    ${sourceFile ? fs.readFileSync(sourceFile, 'utf8').substring(0, 2000) : 'None'}

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
    You are JARVIS, a highly advanced AI system for API diagnostics. 
    Analyze this API error from the perspective of an elite AI assistant:
    Endpoint: ${method} ${endpoint}
    Request Body Sent: ${JSON.stringify(requestData)}
    Response Status Received: ${status}
    Response Body Received: ${JSON.stringify(response)}

    Return a JSON object with:
    {
      "why": "Brief, technical explanation of the failure (Use Jarvis-style terminology, e.g., 'Structural protocol breach detected')",
      "wrong": "Detailed breakdown of what is wrong with the data stream",
      "fix": "Concise optimization steps to restore normal system operations",
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
    1. If there are path parameters like {id} or :id, replace them with a realistic value.
    2. If the context suggests UUIDs or specific string IDs, use them.
    3. Add realistic query parameters if applicable (e.g., ?limit=10).
    4. Return ONLY the relative path string starting with /.

    Source Code Context:
    ${sourceFile ? fs.readFileSync(sourceFile, 'utf8').substring(0, 1500) : 'None'}
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
/**
 * Uses AI to generate a complete OpenAPI JSON spec from the scanned endpoints and source context.
 */
async function generateOpenAPISpecWithAI(endpoints, apiKey) {
    if (!apiKey)
        return null;
    const prompt = `
    You are an API Architect. Based on these discovered raw endpoints, generate a valid, comprehensive OpenAPI 3.0.0 JSON specification.
    
    Raw Endpoints:
    ${JSON.stringify(endpoints.slice(0, 50))} // Limit to 50 for token safety

    Requirements:
    1. Infer summary and description for each endpoint.
    2. Suggest realistic request bodies (JSON) and response schemas (200).
    3. Include security definitions (Bearer Auth).
    4. Return ONLY the JSON object.
  `;
    try {
        const res = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 25000
        });
        return JSON.parse(res.data.choices[0].message.content);
    }
    catch (err) {
        console.error('AI OpenAPI Gen failed:', err.message);
        return null;
    }
}
//# sourceMappingURL=errorExplainer.js.map