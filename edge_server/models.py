import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class MessageModel(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, index=True) # UUID for deduplication
    content = Column(String, nullable=False)
    sender_id = Column(String, nullable=False)
    receiver_id = Column(String, nullable=True) # Optional, None means broadcast
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    priority = Column(Integer, default=1) # 1 (lowest) to 10 (highest)
    is_synced = Column(Boolean, default=False)
