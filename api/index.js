const express = require('express');
const cors = require('cors');
const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

// Mock database for Stark Industries Cloud API
const mock_db = [
    { id: "1", name: "Tony Stark", role: "Iron Man", status: "Active" },
    { id: "2", name: "Steve Rogers", role: "Captain America", status: "Active" }
];

const mock_login_requests = [
    { id: "lr_101", username: "tony", status: "pending" },
    { id: "lr_102", username: "steve", status: "approved" }
];

const mock_parents = [
    { id: "p_001", name: "Howard Stark", children_count: 1 },
    { id: "p_002", name: "Joseph Rogers", children_count: 1 }
];

app.get('/', (req, res) => {
    res.json({ status: "STARK_NODE_CORE_ONLINE", mode: "Mock", source: "Vercel-Hybrid" });
});

app.get('/health', (req, res) => {
    res.json({ status: "ok", cloud_sync: false });
});

app.get('/api/v1/users', (req, res) => {
    res.json(mock_db);
});

app.get('/api/v1/users/:user_id', (req, res) => {
    const user = mock_db.find(u => u.id === req.params.user_id);
    if (!user) return res.status(404).json({ detail: "Target not found in Node Mock archives." });
    res.json(user);
});

app.get('/api/v1/auth/login-requests', (req, res) => {
    res.json(mock_login_requests);
});

app.get('/api/v1/auth/login-requests/:request_id', (req, res) => {
    const lr = mock_login_requests.find(l => l.id === req.params.request_id);
    if (!lr) return res.status(404).json({ detail: "Login request missing from Node grid." });
    res.json(lr);
});

app.get('/api/v1/parents', (req, res) => {
    res.json(mock_parents);
});

app.get('/api/v1/parents/:parent_id', (req, res) => {
    const parent = mock_parents.find(p => p.id === req.params.parent_id);
    if (!parent) return res.status(404).json({ detail: "Parent legacy record not found." });
    res.json(parent);
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`STARK_PROTOCOL: SERVER_ONLINE @ http://localhost:${port}`);
    });
}

module.exports = app;
