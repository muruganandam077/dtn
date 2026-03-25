import requests
from sqlalchemy.orm import Session
from models import MessageModel
import logging
from dateutil.parser import parse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def sync_with_peer(peer_url: str, db: Session):
    """
    Perform a two-way sync with another Edge Server via REST API.
    1. Fetch messages from peer
    2. Save new messages locally
    3. Push local messages to peer
    """
    if not peer_url.replace("http://", "").replace("https://", ""):
        return {"status": "error", "error": "Invalid peer url"}
        
    if not peer_url.startswith("http"):
        peer_url = f"http://{peer_url}"
        
    logger.info(f"Starting DTN Sync with {peer_url}")
    
    try:
        # Step 1: Push local messages
        local_messages = db.query(MessageModel).all()
        local_msgs_payload = [
            {
                "id": m.id,
                "content": m.content,
                "sender_id": m.sender_id,
                "receiver_id": m.receiver_id,
                "timestamp": str(m.timestamp),
                "priority": m.priority,
                "is_synced": True
            } for m in local_messages
        ]
        
        # Step 2: Call the peer's sync endpoint
        response = requests.post(f"{peer_url}/api/sync", json=local_msgs_payload, timeout=5)
        response.raise_for_status()
        
        peer_messages = response.json()
        saved_count = 0
        
        # Step 3: Save missing messages locally
        for msg_data in peer_messages:
            existing = db.query(MessageModel).filter(MessageModel.id == msg_data["id"]).first()
            if not existing:
                new_msg = MessageModel(
                    id=msg_data["id"],
                    content=msg_data["content"],
                    sender_id=msg_data["sender_id"],
                    receiver_id=msg_data.get("receiver_id"),
                    timestamp=parse(msg_data["timestamp"]),
                    priority=msg_data.get("priority", 1),
                    is_synced=True
                )
                db.add(new_msg)
                saved_count += 1
                
        if saved_count > 0:
            db.commit()
            logger.info(f"Saved {saved_count} new messages from peer")
        else:
            logger.info("No new messages from peer")
            
        return {"status": "success", "synced_records": saved_count}
        
    except Exception as e:
        logger.error(f"Sync failed with {peer_url}: {str(e)}")
        return {"status": "error", "error": str(e)}
