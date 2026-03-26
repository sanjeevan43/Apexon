---
description: Basic API Testing Workflow
---

This workflow guides you through the standard process of testing your API using Apexon.

1. **Define Base URL + API Key**
   - Open the Apexon Dashboard.
   - Enter your API's **Base URL** (e.g., `http://localhost:8080`).
   - Enter your **API Key** or Bearer Token.
   - These values are automatically saved to your workspace configuration.

2. **Identify all endpoints**
   - Click the **Discover** button.
   - Apexon will scan your codebase to find defined API routes and endpoints.
   - The discovered endpoints will appear in the dashboard list.

3. **Send request (GET, POST, PUT, DELETE)**
   - Select the endpoints you want to test using the checkboxes.
   - Click the **Execute** button.
   - Apexon will automatically:
     - Generate smart path parameters using AI.
     - Generate valid request bodies for POST/PUT/PATCH requests using AI.
     - Execute the requests with your configured headers.

4. **Validate response**
   - Review the results in the dashboard:
     - **Status code**: Green for 200/201, Red for errors (400, 401, 404, 500, etc.).
     - **Response body**: Click an item to expand and view the JSON response.
     - **Headers**: Validation is handled automatically; check the "AI INSIGHT" for detailed header/auth failure explanations.

5. **Generate report**
   - After execution, click **EXPORT JSON REPORT**.
   - A new JSON file will open containing the full execution results, status codes, response times, and AI analysis for any failures.
