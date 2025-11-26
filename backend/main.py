from fastapi import FastAPI, Depends, HTTPException, Form, Body, UploadFile, File, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
from starlette.requests import Request
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import shutil
from typing import List, Dict, Any, Optional

# ត្រូវប្រាកដថា File db.py ត្រូវបាន import ត្រឹមត្រូវ
from db import users_collection, requests_collection, init_indexes, client

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change_this_secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

app = FastAPI()

# ពិនិត្យមើលផ្លូវ (paths) ទាំងនេះដើម្បីឱ្យត្រូវនឹង Project Structure របស់អ្នក
base_dir = os.path.dirname(os.path.abspath(__file__))
static_path = os.path.join(base_dir, "..", "frontend", "static")
template_path = os.path.join(base_dir, "..", "frontend", "templates")
upload_path = os.path.join(static_path, "uploads")
os.makedirs(upload_path, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_path), name="static")
templates = Jinja2Templates(directory=template_path)

# **FIXED INDENTATION HERE**
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)

async def get_user(username: str):
    return await users_collection.find_one({"username": username})

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return False
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        role = payload.get("role")
        if username is None or role is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await get_user(username)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc["_id"] = str(doc["_id"])
    if "created_at" in doc and isinstance(doc["created_at"], datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    # Serialize paid_date
    if "paid_date" in doc and isinstance(doc["paid_date"], datetime):
        doc["paid_date"] = doc["paid_date"].isoformat()
    return doc

# --- Helper for Monthly Reset Logic ---
def get_current_month_start() -> datetime:
    # Returns the first day of the current month in UTC
    now = datetime.utcnow()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

# --- Server Startup & Admin Seeding ---

@app.on_event("startup")
async def startup():
    try:
        await init_indexes()
        await client.admin.command("ping")
        print("✅ MongoDB connected and indexes ready")
    except Exception as e:
        print("⚠️ Startup init failed:", e)

    # Ensure default admin exists
    admin = await users_collection.find_one({"username": "nou"})
    if not admin:
        hashed = pwd_context.hash(os.getenv("ADMIN_PASS", "nou123")[:72])
        await users_collection.insert_one({
            "username": "nou",
            "hashed_password": hashed,
            "role": "admin",
            "created_at": datetime.utcnow()
        })
        print("✅ Default admin created: nou /", os.getenv("ADMIN_PASS", "nou123"))

# --- Standard Endpoints ---

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer"}

# --- Admin User Management ---

@app.post("/create_user")
async def create_user(
    username: str = Form(...),
    password: str = Form(...),
    role: str = Form(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    existing = await users_collection.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    if role not in ["staff", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    hashed = pwd_context.hash(password[:72])
    await users_collection.insert_one({
        "username": username,
        "hashed_password": hashed,
        "role": role,
        "created_at": datetime.utcnow()
    })
    return {"message": "User created"}

@app.get("/admin/users")
async def list_users(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    users = await users_collection.find({}, {"hashed_password": 0}).to_list(500)
    for u in users:
        u["_id"] = str(u["_id"])
        if "created_at" in u and isinstance(u["created_at"], datetime):
            u["created_at"] = u["created_at"].isoformat()
    return JSONResponse(content=users)

@app.delete("/admin/users/{username}")
async def delete_user(username: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await users_collection.delete_one({"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"User '{username}' deleted"}

# --- Submission Endpoints ---

@app.post("/submit_reimbursement")
async def submit_reimbursement(
    date: str = Form(...),
    description: str = Form(...),
    amount: str = Form(...),
    proof: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
    try:
        amt_val = float(amount)
    except ValueError:
        raise HTTPException(status_code=400, detail="Amount must be a number")
    ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
    ext = os.path.splitext(proof.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Invalid file type")
    safe_name = "".join(c for c in proof.filename if c.isalnum() or c in ("-", "_", ".", " "))
    filename = f"{user['username']}_{int(datetime.utcnow().timestamp())}_{safe_name}"
    file_path = os.path.join(upload_path, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
    doc = {
        "type": "reimbursement",
        "staffName": user["username"],
        "date": date,
        "description": description,
        "amount": amt_val,
        "status": "Pending",
        "proof_filename": filename,
        "created_at": datetime.utcnow()
    }
    await requests_collection.insert_one(doc)
    return {"message": "Reimbursement submitted"}

@app.post("/submit_payment")
async def submit_payment(
    date: str = Form(...),
    description: str = Form(...),
    amount: str = Form(...),
    proof: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
    try:
        amt_val = float(amount)
    except ValueError:
        raise HTTPException(status_code=400, detail="Amount must be a number")
    ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
    ext = os.path.splitext(proof.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Invalid file type")
    safe_name = "".join(c for c in proof.filename if c.isalnum() or c in ("-", "_", ".", " "))
    filename = f"{user['username']}_{int(datetime.utcnow().timestamp())}_{safe_name}"
    file_path = os.path.join(upload_path, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
    doc = {
        "type": "payment",
        "staffName": user["username"],
        "date": date,
        "description": description,
        "amount": amt_val,
        "status": "Pending",
        "proof_filename": filename,
        "created_at": datetime.utcnow()
    }
    await requests_collection.insert_one(doc)
    return {"message": "Payment request submitted"}

# --- Updated Endpoints for Current Month Data (Staff & Admin Dashboard) ---

@app.get("/my_requests")
async def get_my_requests(user: dict = Depends(get_current_user)):
    """
    Staff: Gets requests submitted in the current month.
    """
    if user["role"] != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
    
    # Filter by current staff AND requests created this month
    month_start = get_current_month_start()
    query = {
        "staffName": user["username"],
        "created_at": {"$gte": month_start}
    }
    
    recs = await requests_collection.find(query).to_list(500)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/requests")
async def admin_requests(
    user: dict = Depends(get_current_user),
    type: str = Query(None, description="Filter by type: 'reimbursement' or 'payment'")
):
    """
    Admin: Gets requests for the current month, filtered by type (reimbursement/payment).
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    
    month_start = get_current_month_start()
    # Query for current month's requests
    query = {"created_at": {"$gte": month_start}}

    if type in ["reimbursement", "payment"]:
        query["type"] = type
    
    recs = await requests_collection.find(query).to_list(500)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/pending_summary")
async def get_pending_summary(user: dict = Depends(get_current_user)):
    """
    Admin: Counts pending requests for notification.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    month_start = get_current_month_start()
    base_query = {"status": "Pending", "created_at": {"$gte": month_start}}
    
    r_count = await requests_collection.count_documents({**base_query, "type": "reimbursement"})
    p_count = await requests_collection.count_documents({**base_query, "type": "payment"})

    return {
        "reimbursement_pending": r_count,
        "payment_pending": p_count
    }

@app.patch("/admin/requests/{request_id}")
async def update_status(request_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    """
    Admin: Updates request status, including 'Paid' with a paid_date set by server.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    
    try:
        oid = ObjectId(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Request ID format")

    status_val = payload.get("status")
    if status_val not in ["Pending", "Approved", "Rejected", "Paid"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    update_doc = {"status": status_val}
    
    # Logic: Set paid_date when status is Paid
    if status_val == "Paid":
        update_doc["paid_date"] = datetime.utcnow()
    
    # Optional: If status is reverted from Paid, unset paid_date
    elif status_val != "Paid":
         await requests_collection.update_one({"_id": oid}, {"$unset": {"paid_date": ""}})


    result = await requests_collection.update_one(
        {"_id": oid}, 
        {"$set": update_doc}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request ID not found")
    
    return {"message": f"Status updated to {status_val}"}

# --- NEW Endpoints for History and Record ---

@app.get("/history_requests")
async def get_history_requests(user: dict = Depends(get_current_user)):
    """
    Staff/Admin: Gets all Paid and Rejected requests (History table).
    """
    query = {
        "status": {"$in": ["Paid", "Rejected"]}
    }
    
    # Staff can only see their own history
    if user["role"] == "staff":
        query["staffName"] = user["username"]
    
    # Retrieve all historical data for history table
    recs = await requests_collection.find(query).to_list(None) 
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/record")
async def get_admin_record(user: dict = Depends(get_current_user)):
    """
    Admin: Gets all requests that are Paid (Record table).
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    
    query = {
        "status": "Paid"
    }
    
    # Retrieve all Paid records
    recs = await requests_collection.find(query).to_list(None)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)
@app.get("/health")
async def health_check():
    try:
        await client.admin.command("ping")  # optional check MongoDB
        return {"status": "ok", "mongo": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")
# End of main.py