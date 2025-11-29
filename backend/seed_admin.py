# backend/seed_admin.py
import asyncio
import os
from datetime import datetime
from passlib.context import CryptContext
from db import users_collection

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_admin():
    existing = await users_collection.find_one({"username": "nou"})
    if existing:
        print("⚠️ User 'nou' already exists.")
        return
    admin_pass = os.getenv("ADMIN_PASS", "nou123")
    hashed = pwd_context.hash(admin_pass[:72])
    await users_collection.insert_one({
        "username": "nou",
        "hashed_password": hashed,
        "role": "admin",
        "created_at": datetime.utcnow()
    })
    print("✅ Admin account 'nou' created with password:", admin_pass)

if __name__ == "__main__":
    asyncio.run(seed_admin())
    # seed_admin.py
from db import users_collection
from passlib.context import CryptContext
from datetime import datetime, timezone

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_admin():
    # Clear all admins
    await users_collection.delete_many({"role": "admin"})
    
    # Insert new admin
    hashed = pwd_context.hash("DMF2024")
    await users_collection.insert_one({
        "username": "DMF",
        "hashed_password": hashed,
        "role": "admin",
        "created_at": datetime.now(timezone.utc)
    })
    print("✅ Fresh admin created: DMF / DMF2024")