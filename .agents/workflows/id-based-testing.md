---
description: API AUTOMATED TESTING WORKFLOW (ID-BASED DEPENDENCY)
---

# API AUTOMATED TESTING WORKFLOW (ID-BASED DEPENDENCY)

Follow this structured protocol to ensure high-fidelity API testing with dynamic discovery and dependency resolution.

### 1. USER INPUT
*   **Base URL**: Enter the target environment host (e.g., `http://localhost:8000`).
*   **API Key / Token**: Provide security credentials for STARK-ALFA access.
*   **Optional**: Upload Swagger / OpenAPI JSON spec.
*   **Action**: Click **RUN**.

### 2. API DISCOVERY
*   **If Swagger Provided**:
    *   Parse JSON/YAML structures.
    *   Extract: Endpoints, HTTP Methods, and Parameter Schemas (Path, Query, Body).
*   **Else (Manual/Code Scan)**:
    *   Trigger Apexon Workspace Scan.
    *   Map routes from source code decorators and definitions.

### 3. CLASSIFY ENDPOINTS
Endpoints are automatically sorted into two categories:
*   **Base Endpoints** (Stateless/Listings):
    *   `/auth/login`
    *   `/parents`
    *   `/users`
*   **ID-Based Endpoints** (Resource-Specific):
    *   `/parents/{parent_id}`
    *   `/auth/login-requests/{request_id}`

### 4. EXECUTION FLOW (THE GOLDEN PATH)
> [!IMPORTANT]
> **CORE RULE**: Never call ID-based endpoints directly. Always retrieve the ID from a previous response.

1.  **Step 1: Call Base Endpoint**
    *   Execute `GET /api/v1/auth/login-requests`.
    *   Extract `id`, `user_id`, or `token` from the response.
2.  **Step 2: Dynamic Context Storage**
    *   Save discovered values to the `context` object:
        ```json
        { "request_id": "lr_101", "parent_id": "p_001", "token": "..." }
        ```
3.  **Step 3: Resolve ID-Based Endpoints**
    *   Identify placeholders in the target path: `/api/v1/parents/{parent_id}`.
    *   Inject values: `{parent_id} → context.parent_id`.
4.  **Step 4: Execute Nested Calls**
    *   Perform the calibrated request: `GET /api/v1/parents/p_001`.

### 5. VALIDATION
For every executed request:
*   Verify Status Codes (200, 201).
*   Validate Response Schema against identified models.
*   Check Data Types and Required Fields.

### 6. ERROR HANDLING
*   **ID MISSING**: If a dependency cannot be satisfied, Skip the endpoint and log: `[APE-BREACH] Missing parent_id for /parents/{parent_id}`.
*   **API FAILURE**: Log status and perform optional retry if configured.

### 7. REPORT GENERATION
Compile post-action data into a comprehensive summary:
*   **Total APIs Tested**
*   **Passed / Failed / Skipped** (specifically noting missing dependencies)
*   **Response Latency Metrics**

### 8. ADVANCED ANALYTICS (PRO)
*   Parallel execution for independent resource branches.
*   Token auto-refresh for long-running test suites.
*   Environment switching (JARVIS_DEV vs. STARK_PROD).
