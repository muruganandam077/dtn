from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from typing import List
import uvicorn
import uuid
import asyncio
import os
import logging
from pydantic import BaseModel
from dateutil.parser import parse
from pyngrok import ngrok
from dotenv import load_dotenv

from database import engine, SessionLocal, init_db, get_db
from models import Base, MessageModel
from ai_priority import get_message_priority
from dtn_sync import sync_with_peer

load_dotenv()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    
    port = int(os.getenv("PORT", 8000))
    ngrok_token = os.getenv("NGROK_AUTHTOKEN")
    
    if ngrok_token:
        ngrok.set_auth_token(ngrok_token)
        public_url = ngrok.connect(port).public_url
        logger.info(f"==================================================")
        logger.info(f"🚀 ngrok tunnel established: {public_url}")
        logger.info(f"==================================================")
    else:
        logger.info("No NGROK_AUTHTOKEN found in .env. Running locally only.")
        
    peer_url = os.getenv("AUTO_SYNC_PEER_URL")
    if peer_url:
        async def auto_sync_task():
            while True:
                await asyncio.sleep(5)
                try:
                    db = SessionLocal()
                    result = sync_with_peer(peer_url, db)
                    if result.get("new_messages"):
                        for msg in result.get("new_messages", []):
                            await manager.broadcast(msg)
                    db.close()
                except Exception as e:
                    logger.error(f"Auto-sync failed: {e}")
        
        asyncio.create_task(auto_sync_task())
        logger.info(f"🔄 Auto-sync enabled for peer: {peer_url}")
        
    yield

app = FastAPI(lifespan=lifespan, title="DTN Edge Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

class MessageCreate(BaseModel):
    id: str = None
    content: str
    sender_id: str
    receiver_id: str = None

class SyncRequest(BaseModel):
    peer_url: str

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_id = data.get("id", str(uuid.uuid4()))
            content = data.get("content", "")
            sender_id = data.get("sender_id", "Unknown")
            receiver_id = data.get("receiver_id", None)
            latitude = data.get("latitude", None)
            longitude = data.get("longitude", None)
            
            # Deduplicate just in case
            existing = db.query(MessageModel).filter(MessageModel.id == msg_id).first()
            if not existing:
                priority = get_message_priority(content)
                new_msg = MessageModel(
                    id=msg_id,
                    content=content,
                    sender_id=sender_id,
                    receiver_id=receiver_id,
                    priority=priority,
                    latitude=latitude,
                    longitude=longitude
                )
                db.add(new_msg)
                db.commit()
                db.refresh(new_msg)
                
                await manager.broadcast({
                    "id": new_msg.id,
                    "content": new_msg.content,
                    "sender_id": new_msg.sender_id,
                    "receiver_id": new_msg.receiver_id,
                    "timestamp": str(new_msg.timestamp),
                    "priority": new_msg.priority,
                    "latitude": new_msg.latitude,
                    "longitude": new_msg.longitude
                })
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/messages")
def get_messages(db: Session = Depends(get_db)):
    msgs = db.query(MessageModel).order_by(MessageModel.priority.desc(), MessageModel.timestamp.desc()).all()
    return msgs

@app.post("/api/sync")
async def receive_sync(messages: List[dict], db: Session = Depends(get_db)):
    saved_count = 0
    new_records = []
    for msg_data in messages:
        existing = db.query(MessageModel).filter(MessageModel.id == msg_data["id"]).first()
        if not existing:
            new_msg = MessageModel(
                id=msg_data["id"],
                content=msg_data["content"],
                sender_id=msg_data["sender_id"],
                receiver_id=msg_data.get("receiver_id"),
                timestamp=parse(msg_data["timestamp"]),
                priority=msg_data.get("priority", 1),
                is_synced=True,
                latitude=msg_data.get("latitude"),
                longitude=msg_data.get("longitude")
            )
            db.add(new_msg)
            saved_count += 1
            new_records.append(new_msg)
            
    if saved_count > 0:
        db.commit()
        
    # Broadcast to connected clients so UI updates instantly
    for msg in new_records:
        await manager.broadcast({
            "id": msg.id,
            "content": msg.content,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "timestamp": str(msg.timestamp),
            "priority": msg.priority,
            "latitude": msg.latitude,
            "longitude": msg.longitude
        })

    local_messages = db.query(MessageModel).all()
    return [
        {
            "id": m.id,
            "content": m.content,
            "sender_id": m.sender_id,
            "receiver_id": m.receiver_id,
            "timestamp": str(m.timestamp),
            "priority": m.priority,
            "latitude": m.latitude,
            "longitude": m.longitude
        } for m in local_messages
    ]

@app.post("/api/trigger_sync")
async def trigger_sync(req: SyncRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    result = sync_with_peer(req.peer_url, db)
    
    if result.get("new_messages"):
        for msg in result.get("new_messages", []):
            await manager.broadcast(msg)
            
    return {"status": result["status"], "synced_records": result["synced_records"]}

if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
