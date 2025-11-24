# backend/db.py
from dotenv import load_dotenv
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")

if not MONGO_URI or not DB_NAME:
    raise RuntimeError("Missing MONGO_URI or DB_NAME in .env")

client = AsyncIOMotorClient(
    MONGO_URI,
    serverSelectionTimeoutMS=5000,
    maxPoolSize=20,
    minPoolSize=1
)

db = client[DB_NAME]

users_collection = db["users"]
requests_collection = db["requests"]

async def init_indexes():
    try:
        await client.admin.command("ping")
        print("✅ MongoDB ping OK")
    except ConnectionFailure as e:
        print("MongoDB connection failed:", e)

    await users_collection.create_index("username", unique=True)
    await requests_collection.create_index("staffName")
    await requests_collection.create_index("type")
    await requests_collection.create_index([("created_at", -1)])