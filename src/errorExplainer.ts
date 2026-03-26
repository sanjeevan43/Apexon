import * as fs from 'fs';
import axios from 'axios';

export interface AIAnalysis {
  why: string;
  wrong: string;
  fix: string;
  newPath?: string;
}

/** 
 * Uses AI to generate a realistic JSON body for a given endpoint.
 */
export async function generateRequestBodyWithAI(
  endpoint: string,
  method: string,
  apiKey: string,
  sourceFile?: string
): Promise<any> {
  if (!apiKey) return { id: 1, sample: 'no-api-key' };

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
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const content = res.data.choices[0].message.content.trim();
    return JSON.parse(content);
  } catch (err: any) {
    console.error('AI Body Gen failed:', err.message);
    return { name: "Test Item", status: "active" }; 
  }
}

/** 
 * Uses AI to analyze an API error and provide structured feedback.
 */
export async function explainWithAI(
  endpoint: string,
  method: string,
  requestData: any,
  response: any,
  status: number | null,
  apiKey: string
): Promise<AIAnalysis> {
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
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 12000
      }
    );

    const content = res.data.choices[0].message.content;
    return JSON.parse(content) as AIAnalysis;
  } catch (err: any) {
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
export async function autoExpandUrlWithAI(
  path: string,
  method: string,
  apiKey: string,
  sourceFile?: string
): Promise<string> {
  if (!apiKey) return path.replace(/\{[^}]+\}/g, '1').replace(/:[a-zA-Z0-9_]+/g, '1');

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
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      },
      {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 6000
      }
    );

    const expanded = res.data.choices[0].message.content.trim();
    return expanded.startsWith('/') ? expanded : '/' + expanded;
  } catch {
    return path.replace(/\{[^}]+\}/g, '1').replace(/:[a-zA-Z0-9_]+/g, '1');
  }
}

/**
 * Uses AI to generate a complete OpenAPI JSON spec from the scanned endpoints and source context.
 */
export async function generateOpenAPISpecWithAI(
  endpoints: any[],
  apiKey: string
): Promise<any> {
  if (!apiKey) return null;

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
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      },
      {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 25000
      }
    );

    return JSON.parse(res.data.choices[0].message.content);
  } catch (err: any) {
    console.error('AI OpenAPI Gen failed:', err.message);
    return null;
  }
}
