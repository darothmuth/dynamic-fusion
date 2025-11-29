# ====================================================================
# STAFF REIMBURSEMENT & PAYMENT PORTAL - BACKEND (FINAL CLEANED main.py)
# ====================================================================

from fastapi import FastAPI, Depends, HTTPException, Form, Body, UploadFile, File, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
from starlette.requests import Request
from datetime import datetime, timedelta, timezone 
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import shutil
from typing import Dict, Any, Optional

# IMPORTANT: Make sure your db.py provides these
from db import users_collection, requests_collection, init_indexes, client, get_next_sequence_value

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change_this_secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080")) 

# --- App Initialization and Static/Templates Setup ---

app = FastAPI()

base_dir = os.path.dirname(os.path.abspath(__file__))
static_path = os.path.abspath(os.path.join(base_dir, "..", "frontend", "static"))
template_path = os.path.abspath(os.path.join(base_dir, "..", "frontend", "templates"))
upload_path = os.path.join(static_path, "uploads")
os.makedirs(upload_path, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_path), name="static")
templates = Jinja2Templates(directory=template_path)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- Security Setup ---

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated=["auto"])

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)

async def get_user(username: str):
    return await users_collection.find_one({"username": username})

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire.timestamp()}) 
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None or role is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await get_user(username)
    if user is None:
        raise credentials_exception
    return user

# --- Utility Functions ---

def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if "request_id" not in doc or not doc["request_id"]:
        doc["request_id"] = f"PR{str(doc['_id'])[-4:]}"
    doc["_id"] = str(doc["_id"])
    for k in ("created_at", "paid_date", "approved_date"):
        if k in doc and isinstance(doc[k], datetime):
            if doc[k].tzinfo is None:
                doc[k] = doc[k].replace(tzinfo=timezone.utc)
            doc[k] = doc[k].isoformat()
    return doc

def get_current_month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=None) 

# --- Startup & Health ---

@app.on_event("startup")
async def startup():
    try:
        await init_indexes()
        await client.admin.command("ping")
        print("✅ MongoDB connected and indexes ready")
    except Exception as e:
        print("⚠️ Startup init failed:", e)

    admin_pass = os.getenv("ADMIN_PASS", "nou123")
    admin = await users_collection.find_one({"username": "nou"})
    if not admin:
        hashed = pwd_context.hash(admin_pass[:72])
        await users_collection.insert_one({
            "username": "nou",
            "hashed_password": hashed,
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        print("✅ Default admin created: nou /", admin_pass)

@app.get("/health")
async def health_check():
    try:
        await client.admin.command("ping")
        return {"status": "ok", "mongo": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

# --- Root HTML Endpoint ---

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- Login & Token ---

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "role": user["role"]}

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
        "created_at": datetime.now(timezone.utc)
    })
    return {"message": "User created"}

@app.get("/admin/users")
async def list_users(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    users = await users_collection.find({}, {"hashed_password": 0}).to_list(500)
    users = [serialize_doc(u) for u in users]
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
    filename = f"{user['username']}_{int(datetime.now(timezone.utc).timestamp())}_{safe_name}"
    file_path = os.path.join(upload_path, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

    next_seq = await get_next_sequence_value("request_id")
    req_id = f"PR{next_seq:04d}"

    doc = {
        "type": "reimbursement",
        "request_id": req_id,
        "staffName": user["username"],
        "date": date,
        "description": description,
        "amount": amt_val,
        "status": "Pending",
        "proof_filename": filename,
        "created_at": datetime.now(timezone.utc)
    }
    await requests_collection.insert_one(doc)
    return {"message": f"Reimbursement submitted with ID: {req_id}", "request_id": req_id}

@app.post("/submit_payment")
async def submit_payment(
    date: str = Form(...),
    purpose: str = Form(...),
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
    filename = f"{user['username']}_{int(datetime.now(timezone.utc).timestamp())}_{safe_name}"
    file_path = os.path.join(upload_path, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

    next_seq = await get_next_sequence_value("request_id")
    req_id = f"PR{next_seq:04d}"

    doc = {
        "type": "payment",
        "request_id": req_id,
        "staffName": user["username"],
        "date": date,
        "purpose": purpose,
        "amount": amt_val,
        "status": "Pending",
        "proof_filename": filename,
        "created_at": datetime.now(timezone.utc)
    }
    await requests_collection.insert_one(doc)
    return {"message": f"Payment request submitted with ID: {req_id}", "request_id": req_id}

# --- Dashboard & Review Endpoints ---

@app.get("/my_requests")
async def get_my_requests(user: dict = Depends(get_current_user)):
    if user["role"] != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
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
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    month_start = get_current_month_start()
    query = {"created_at": {"$gte": month_start}}
    if type in ["reimbursement", "payment"]:
        query["type"] = type
    recs = await requests_collection.find(query).to_list(500)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/pending_summary")
async def get_pending_summary(user: dict = Depends(get_current_user)):
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

@app.patch("/admin/requests/{request_id_or_oid}")
async def update_status(request_id_or_oid: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    # Improved: Try request_id PRxxxx first, else fallback to ObjectId
    doc = await requests_collection.find_one({"request_id": request_id_or_oid})
    if doc:
        query = {"request_id": request_id_or_oid}
    else:
        try:
            oid = ObjectId(request_id_or_oid)
            doc = await requests_collection.find_one({"_id": oid})
            if not doc:
                raise HTTPException(status_code=404, detail="Request ID not found")
            query = {"_id": oid}
        except Exception:
            raise HTTPException(status_code=404, detail="Request ID not found")
    status_val = payload.get("status")
    if status_val not in ["Pending", "Approved", "Rejected", "Paid"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    update_doc = {"status": status_val}
    if status_val == "Paid":
        update_doc["paid_date"] = datetime.now(timezone.utc)
        update_doc["approved_date"] = doc.get("approved_date", datetime.now(timezone.utc))
    elif status_val == "Approved":
        update_doc["approved_date"] = datetime.now(timezone.utc)
    update_operation = {"$set": update_doc}
    if status_val in ["Rejected", "Pending"]:
        update_operation["$unset"] = {"paid_date": "", "approved_date": ""}
    result = await requests_collection.update_one(query, update_operation)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request ID not found")
    return {"message": f"Status updated to {status_val}"}

@app.get("/history_requests")
async def get_history_requests(user: dict = Depends(get_current_user)):
    query = {} 
    if user["role"] == "staff":
        query["staffName"] = user["username"]
    recs = await requests_collection.find(query).to_list(None)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/paid_records")
async def get_admin_record(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    query = {"status": "Paid"}
    recs = await requests_collection.find(query).to_list(None)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)