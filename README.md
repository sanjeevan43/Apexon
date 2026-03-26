# Apexon: Fully Automated AI-Powered API Testing

**Apexon** is a production-grade VS Code extension that automatically scans your code for API endpoints, tests them in real-time, and uses AI to explain why any request fails. It combines the structured overview of **Swagger UI** with the execution power of **Postman**, all managed by an intelligent autonomous workflow.

---

## 🚀 Key Features

*   **Auto-Scan & Discovery**: Detects endpoints in `.js`, `.ts`, `.py`, and `.swift` projects (Express, FastAPI, Flask, Vapor).
*   **Smart Server Handling**: Automatically checks if your server is running. If not, it attempts to start it using framework-specific commands (`npm start`, `uvicorn`, etc.).
*   **Realistic Request Generation**: Generates realistic JSON sample bodies for POST/PUT/PATCH requests based on the endpoint path (Login, User, Product, Search, etc.).
*   **Dynamic Parameter Normalization**: Replaces path variables like `/users/:id` or `/posts/{slug}` with testable values like `/users/1` or `/posts/test`.
*   **AI-Powered Error Insights**: If an API call fails, Apexon sends the request/response data to an AI model to explain:
    *   **Why** it happened.
    *   **What** specifically is wrong.
    *   **How** to fix it immediately.

---

## 🛠️ Getting Started

1.  **Install the Extension**: Load this folder into VS Code or install the generated `.vsix`.
2.  **Open the Apexon Sidebar**: Click the Apexon logo in your VS Code Activity Bar.
3.  **Configure**:
    *   **Base URL**: Enter your running server's URL (e.g., `http://localhost:8000`).
    *   **API Key**: Provide your OpenAI API key for AI-driven error analysis.
4.  **Scan & Run**:
    *   Click **Scan Files** to discover every API route defined in your workspace.
    *   Click **Run Automated Tests** to execute them all at once and see the live results.

---

## 🎨 Professional Dashboard

The dashboard provides a "Postman + Swagger" experience:
*   **One-Click Discovery**: Instantly map out your entire backend project.
*   **Detailed Trace**: Click any endpoint to see the exact JSON sent and the raw response returned.
*   **AI Sparkle**: Failed tests are automatically labeled with ✨ AI INSIGHTS to accelerate your debugging loop.

---

## ⚙️ Configuration Properties

| Property | Description | Default |
| :--- | :--- | :--- |
| `apexon.baseURL` | The base URL for all API requests | `http://localhost:8000` |
| `apexon.apiKey` | Your OpenAI API key for AI analysis | `""` |
| `apexon.timeout` | Request timeout in milliseconds | `5000` |

---

## 📦 Developer Info

*   **Author**: `sanjeevan43`
*   **License**: `MIT`
*   **Version**: `0.3.1`
