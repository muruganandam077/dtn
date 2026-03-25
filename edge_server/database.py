from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base
import os

# To allow running multiple instances locally, we can pass DB name via env var
DB_NAME = os.getenv("DB_NAME", "messages.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///./{DB_NAME}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
