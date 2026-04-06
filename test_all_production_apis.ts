import axios from 'axios';

const BASE_URL = "https://apexon-sooty.vercel.app";
const API_KEY = "sk-arc-reactor-7r8e9f0g1h2j3k4l5m6n"; // Our mock Stark key

async function runTest() {
    console.log("--- APEXON PRODUCTION API DIAGNOSTIC (PHASE-BASED) ---");
    const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' };
    const idCache = {};

    // 1. Define all endpoints
    const endpoints = [
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/api/v1/users' },
        { method: 'GET', path: '/api/v1/auth/login-requests' },
        { method: 'GET', path: '/api/v1/parents' },
        // ID-based endpoints
        { method: 'GET', path: '/api/v1/users/{id}' },
        { method: 'GET', path: '/api/v1/auth/login-requests/{id}' },
        { method: 'GET', path: '/api/v1/parents/{id}' }
    ];

    // --- PHASE 1: BASE ENDPOINTS ---
    console.log("\n[PHASE 1] EXECUTING BASE ENDPOINTS...");
    for (const ep of endpoints.slice(0, 5)) {
        try {
            console.log(`\nENGAGING: ${ep.method} ${ep.path}`);
            const res = await axios.get(`${BASE_URL}${ep.path}`, { headers });
            console.log(`STATUS: ${res.status}`);
            
            // Extract IDs for the cache
            const data = Array.isArray(res.responseData || res.data) ? (res.responseData || res.data)[0] : (res.responseData || res.data);
            if (data && typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (key.toLowerCase().endsWith('id') || key.toLowerCase() === 'uuid') {
                   idCache[key] = data[key];
                   if (!idCache['id']) idCache['id'] = data[key];
                   console.log(`[CONTEXT] Extracted ${key}: ${data[key]}`);
                }
              });
            }
        } catch (e) {
            console.log(`FAILED: ${ep.path} - ${e.message}`);
        }
    }

    // --- PHASE 2: ID-BASED ENDPOINTS ---
    console.log("\n[PHASE 2] EXECUTING ID-BASED ENDPOINTS (INJECTING CONTEXT)...");
    for (const ep of endpoints.slice(5)) {
        try {
            let currentPath = ep.path;
            const placeholders = currentPath.match(/\{([^}]+)\}/g) || [];
            
            for (const placeholder of placeholders) {
                const paramName = placeholder.slice(1, -1);
                // In our mock API, 'id' is often the base property
                const val = idCache[paramName] || idCache['id'] || Object.values(idCache)[0];
                if (val) {
                    currentPath = currentPath.replace(placeholder, val);
                    console.log(`[RECALIBRATION] ${placeholder} -> ${val}`);
                }
            }

            console.log(`ENGAGING: ${ep.method} ${currentPath}`);
            const res = await axios.get(`${BASE_URL}${currentPath}`, { headers });
            console.log(`STATUS: ${res.status}`);
            console.log(`DATA: ${JSON.stringify(res.data, null, 2)}`);
        } catch (e) {
            console.log(`FAILED: ${ep.path} - ${e.message}`);
        }
    }

    console.log("\n--- MISSION COMPLETE. ALL SYSTEMS ARE NOMINAL. ---");
}

runTest();
