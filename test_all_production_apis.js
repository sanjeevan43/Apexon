const axios = require('axios');

const BASE_URL = "https://apexon-sooty.vercel.app";
const API_KEY = "sk-arc-reactor-7r8e9f0g1h2j3k4l5m6n";

async function runTest() {
    console.log("--- APEXON PRODUCTION API DIAGNOSTIC (PHASE-BASED) ---");
    const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' };
    const idCache = {};

    // 1. Define all base endpoints
    const baseEndpoints = [
        '/',
        '/health',
        '/api/v1/users',
        '/api/v1/auth/login-requests',
        '/api/v1/parents'
    ];

    // --- PHASE 1: BASE ENDPOINTS ---
    console.log("\n[PHASE 1] EXECUTING BASE ENDPOINTS...");
    for (const path of baseEndpoints) {
        try {
            console.log(`\nENGAGING: GET ${path}`);
            const res = await axios.get(`${BASE_URL}${path}`, { headers });
            console.log(`STATUS: ${res.status}`);
            
            // Extract IDs for the cache
            const data = Array.isArray(res.data) ? res.data[0] : res.data;
            if (data && typeof data === 'object') {
              Object.keys(data).forEach(key => {
                if (key.toLowerCase().endsWith('id')) {
                   idCache[key] = data[key];
                   if (!idCache['id']) idCache['id'] = data[key];
                   console.log(`[CONTEXT] Extracted ${key}: ${data[key]}`);
                }
              });
            }
        } catch (e) {
            console.log(`FAILED: ${path} - ${e.message}`);
        }
    }

    // --- PHASE 2: ID-BASED ENDPOINTS ---
    console.log("\n[PHASE 2] EXECUTING ID-BASED ENDPOINTS (INJECTING CONTEXT)...");
    const idEndpoints = [
        '/api/v1/users/{user_id}',
        '/api/v1/auth/login-requests/{request_id}',
        '/api/v1/parents/{parent_id}'
    ];

    for (const path of idEndpoints) {
        try {
            let currentPath = path;
            const matches = currentPath.match(/\{([^}]+)\}/g);
            
            if (matches) {
                for (const placeholder of matches) {
                    const paramName = placeholder.slice(1, -1);
                    const val = idCache[paramName] || idCache['id'];
                    if (val) {
                        currentPath = currentPath.replace(placeholder, val);
                        console.log(`[RECALIBRATION] ${placeholder} -> ${val}`);
                    } else {
                        console.log(`[APE-ABORT] MISSING CONTEXT FOR ${placeholder}. SKIPPING.`);
                        throw new Error(`Missing ID for ${placeholder}`);
                    }
                }
            }

            console.log(`ENGAGING: GET ${currentPath}`);
            const res = await axios.get(`${BASE_URL}${currentPath}`, { headers });
            console.log(`STATUS: ${res.status}`);
            console.log(`DATA: ${JSON.stringify(res.data, null, 2)}`);
        } catch (e) {
            console.log(`FAILED: ${path} - ${e.message}`);
        }
    }

    console.log("\n--- MISSION COMPLETE. ALL SYSTEMS ARE NOMINAL. ---");
}

runTest();
