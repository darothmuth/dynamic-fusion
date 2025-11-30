# backend/seed_admin.py
import asyncio
from datetime import datetime, timezone
from passlib.context import CryptContext
# ត្រូវប្រាកដថា db.py របស់អ្នកកំណត់ users_collection ត្រឹមត្រូវ
from db import users_collection 

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_admin():
    # 1. ⚠️ លុប Accounts ដែលមាន role ជា "admin" ទាំងអស់ដែលមានស្រាប់
    # នេះនឹងលុប 'nou' ចេញ ប្រសិនបើ 'nou' មាន role ជា 'admin'
    delete_result = await users_collection.delete_many({"role": "admin"})
    print(f"🗑️ Deleted {delete_result.deleted_count} existing admin accounts.")
    
    # 2. បញ្ចូល admin ថ្មី (DMF)
    admin_user = "DMF"
    admin_pass = "DMF2024"
    
    hashed = pwd_context.hash(admin_pass)
    await users_collection.insert_one({
        "username": admin_user,
        "hashed_password": hashed,
        "role": "admin",
        "created_at": datetime.now(timezone.utc)
    })
    print(f"✅ Fresh admin created: {admin_user} / {admin_pass}")

if __name__ == "__main__":
    # ត្រូវប្រាកដថា server មិនទាន់ដំណើរការទេ ពេល run script នេះ
    # ហើយ database connection នៅក្នុង db.py ដំណើរការ
    asyncio.run(seed_admin())