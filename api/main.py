import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
import json

app = FastAPI(title="Stark Industries Cloud API")

# JARVIS: Attempting Firebase Initialization
# Look for serviceAccountKey.json or a custom path in .env
cred_path = os.getenv("FIREBASE_CRED_PATH", "serviceAccountKey.json")
use_mock = True

try:
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db_client = firestore.client()
        use_mock = False
        print("PROTOCOL: FIREBASE_CLOUD_CONNECTION_ESTABLISHED")
    else:
        print("PROTOCOL: FIREBASE_CRED_MISSING. INITIALIZING LOCAL_MOCK_GRID.")
except Exception as e:
    print(f"PROTOCOL: FIREBASE_PROTOCOL_FAILURE: {e}. FALLING BACK TO MOCK.")

# Mock database if Firebase is not active
mock_db = [
        {"id": "1", "name": "Tony Stark", "role": "Iron Man", "status": "Active"},
        {"id": "2", "name": "Steve Rogers", "role": "Captain America", "status": "Active"}
]

class UserCreate(BaseModel):
    name: str
    role: str
    status: Optional[str] = "Active"
    access_code: Optional[str] = "STARK-001"

@app.get("/")
async def root():
    return {"status": "JARVIS_CLOUD_CORE_ONLINE", "mode": "Firebase" if not use_mock else "Mock"}

@app.get("/health")
async def health():
    return {"status": "ok", "cloud_sync": not use_mock}

@app.get("/api/v1/users")
async def get_users():
    if use_mock: return mock_db
    
    users_ref = db_client.collection("users")
    docs = users_ref.stream()
    return [{**doc.to_dict(), "id": doc.id} for doc in docs]

@app.post("/api/v1/users", status_code=201)
async def create_user(user: UserCreate):
    data = user.dict()
    if use_mock:
        data["id"] = str(len(mock_db) + 1)
        mock_db.append(data)
        return data
        
    doc_ref = db_client.collection("users").document()
    doc_ref.set(data)
    return {**data, "id": doc_ref.id}

@app.get("/api/v1/users/{user_id}")
async def get_user_details(user_id: str):
    if use_mock:
        user = next((u for u in mock_db if u["id"] == user_id), None)
        if not user: raise HTTPException(404, "Target missing from mock grid.")
        return user
        
    doc = db_client.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Target not found in Firebase Cloud archives.")
    return {**doc.to_dict(), "id": doc.id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
