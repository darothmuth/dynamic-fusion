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
counters_collection = db["counters"] # NEW: Collection for sequences

# --- Request ID Sequence Logic ---

async def get_next_sequence_value(sequence_name: str) -> int:
    """
    Atomically increments and returns the next sequence value for a given sequence name.
    """
    # Use find_one_and_update with $inc to atomically increment the counter
    result = await counters_collection.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"sequence_value": 1}},
        upsert=True,  # Creates the document if it doesn't exist
        return_document=True  # Returns the updated document
    )
    # The result structure from find_one_and_update is a full document.
    return result["sequence_value"]

async def init_counters():
    """
    Initialize the counter for request IDs if it doesn't exist, starting from 0.
    """
    # Check if the counter for 'request_id' already exists
    initial_counter = await counters_collection.find_one({"_id": "request_id"})
    if not initial_counter:
        # Start the sequence value from 0 so the first call returns 1 (R0001 or P0001)
        await counters_collection.insert_one({"_id": "request_id", "sequence_value": 0})
        print("✅ Request ID counter initialized.")
    else:
        print("✅ Request ID counter already exists.")


# --- Main Index Initialization ---

async def init_indexes():
    try:
        await client.admin.command("ping")
        print("✅ MongoDB ping OK")
    except ConnectionFailure as e:
        print("MongoDB connection failed:", e)

    # Indexes
    await users_collection.create_index("username", unique=True)
    await requests_collection.create_index("staffName")
    await requests_collection.create_index("type")
    await requests_collection.create_index([("created_at", -1)])
    
    # NEW: Initialize the request ID counter
    await init_counters()