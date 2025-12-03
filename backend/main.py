from fastapi import FastAPI, Depends, HTTPException, Form, Body, UploadFile, File, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
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
import os, shutil, re
from typing import Dict, Any, Optional

# --- DB Imports (Requires db.py and motor) ---
# Assuming db.py correctly exports: users_collection, requests_collection, 
# init_indexes, client, get_next_sequence_value
from db import users_collection, requests_collection, init_indexes, client, get_next_sequence_value

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change_this_secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# --- App Initialization ---
app = FastAPI()

backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(backend_dir, ".."))
frontend_dir = os.path.join(project_root, "frontend")

static_path = os.path.join(frontend_dir, "static")
template_path = os.path.join(frontend_dir, "templates")

# Use environment variable for upload path, fallback to a local folder in project root
upload_path = os.getenv("UPLOAD_PATH", os.path.join(project_root, "uploads")) 
os.makedirs(upload_path, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_path), name="static")
templates = Jinja2Templates(directory=template_path)

# --- CORSMiddleware configuration (This section has been fixed for indentation) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Security ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated=["auto"])

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

async def get_user(username: str):
    return await users_collection.find_one({"username": username})

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    # Check if user exists AND password is correct
    if not user or not verify_password(password, user.get("hashed_password", "")):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire.timestamp()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# NEW: A function to decode and validate the token payload
def decode_token_payload(token: str) -> Dict[str, Any]:
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
        return {"username": username, "role": role}
    except JWTError:
        raise credentials_exception

# MODIFIED: get_current_user now accepts token directly or via Depends
async def get_current_user(token: str = Depends(oauth2_scheme)):
    # Decode payload first
    payload = decode_token_payload(token)
    username = payload["username"]
    role = payload["role"]
    
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Verify against DB for user existence
    user = await get_user(username)
    if user is None:
        raise credentials_exception
    
    # Ensure role in token matches role in DB (important for quick admin changes)
    if user["role"] != role:
        credentials_exception.detail = "Role mismatch. Please re-login."
        raise credentials_exception
        
    return user

# --- Utility ---
def serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    # Ensure request_id is present for front-end stability
    if "request_id" not in doc or not doc["request_id"]:
        # Fallback to create a request_id if missing (e.g., from old data)
        doc["request_id"] = f"PR{str(doc['_id'])[-4:]}"
        
    doc["_id"] = str(doc["_id"])
    
    # Format datetimes consistently (now all datetimes should be UTC-aware)
    for k in ("created_at", "paid_date", "approved_date"):
        if k in doc and isinstance(doc[k], datetime):
            # Ensure it is UTC before converting to ISO string
            if doc[k].tzinfo is None:
                 doc[k] = doc[k].replace(tzinfo=timezone.utc)
            doc[k] = doc[k].isoformat()
    return doc

# Returns a timezone-aware datetime object (UTC)
def get_current_month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

def clean_filename(original_filename: str, username: str) -> str:
    name, ext = os.path.splitext(original_filename)
    ext = ext.lower()
    # Replace non-word/non-dot/non-hyphen characters with an underscore
    safe_name = re.sub(r'[^\w\.\-]', '_', name).strip('_')
    if not safe_name:
        safe_name = "attachment"
    timestamp = int(datetime.now(timezone.utc).timestamp())
    return f"{username}_{timestamp}_{safe_name}{ext}"

# --- Startup & Shutdown ---
@app.on_event("startup")
async def startup():
    try:
        await client.admin.command("ping")
        await init_indexes()
        print("✅ MongoDB connected and indexes ready")
    except Exception as e:
        print(f"❌ CRITICAL ERROR: MongoDB connection failed during startup. Check MONGO_URI and network access. Details: {e}")
        raise e 

    # Default Admin Creation
    admin_pass = os.getenv("ADMIN_PASS", "nou123")
    admin = await users_collection.find_one({"username": "nou"})
    if not admin:
        hashed = pwd_context.hash(admin_pass)
        await users_collection.insert_one({
            "username": "nou",
            "hashed_password": hashed,
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        print(f"✅ Default admin created: nou / {admin_pass}")

@app.on_event("shutdown")
async def shutdown():
    if client:
        client.close()
    print("🔒 MongoDB connection closed")

# --- Health ---
@app.get("/health")
async def health_check():
    try:
        await client.admin.command("ping")
        return {"status": "ok", "mongo": "connected"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

# --- Root ---
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# --- Login ---
@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Use the role from the database for the token
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "role": user["role"]}

# --- User Management ---
@app.post("/create_user")
async def create_user(
    username: str = Form(...), 
    password: str = Form(...), 
    role: str = Form(...), 
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    existing = await users_collection.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    if role not in ["staff", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    hashed = pwd_context.hash(password)
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
    # Exclude hashed_password for security
    users = await users_collection.find({}, {"hashed_password": 0}).to_list(500)
    users = [serialize_doc(u) for u in users]
    return JSONResponse(content=users)

@app.delete("/admin/users/{username}")
async def delete_user(username: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if username == user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
    
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
        # Basic date validation
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
        
    try:
        amt_val = float(amount)
        if amt_val <= 0:
            raise ValueError("Amount must be positive.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Amount must be a positive number")

    ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
    ext = os.path.splitext(proof.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTS)}")

    filename = clean_filename(proof.filename, user['username'])
    file_path = os.path.join(upload_path, filename)
    try:
        # Copy file to the dedicated upload path
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        # Ensure file is closed even if copy fails
        proof.file.close() 
        raise HTTPException(status_code=500, detail=f"File upload failed on server: {str(e)}")

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
    try:
        await requests_collection.insert_one(doc)
        return {"message": f"Reimbursement request submitted with ID: {req_id}", "request_id": req_id}
    except Exception as e:
        # If DB insert fails, try to clean up the uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Database submission failed: {str(e)}")


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
        # Basic date validation
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
    
    try:
        amt_val = float(amount)
        if amt_val <= 0:
            raise ValueError("Amount must be positive.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Amount must be a positive number")

    ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
    ext = os.path.splitext(proof.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTS)}")

    filename = clean_filename(proof.filename, user['username'])
    file_path = os.path.join(upload_path, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(proof.file, buffer)
    except Exception as e:
        # Ensure file is closed even if copy fails
        proof.file.close()
        raise HTTPException(status_code=500, detail=f"File upload failed on server: {str(e)}")

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
    try:
        await requests_collection.insert_one(doc)
        return {"message": f"Payment request submitted with ID: {req_id}", "request_id": req_id}
    except Exception as e:
        # If DB insert fails, try to clean up the uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Database submission failed: {str(e)}")


# --- Dashboard & Review Endpoints ---
@app.get("/my_requests")
async def get_my_requests(user: dict = Depends(get_current_user)):
    # Staff can see all their requests from the current month onwards (Dashboard/Current)
    if user["role"] != "staff":
        raise HTTPException(status_code=403, detail="Staff only")
        
    month_start = get_current_month_start()
    # Filter for the current user and for requests created this month or later
    query = {"staffName": user["username"], "created_at": {"$gte": month_start}}
    recs = await requests_collection.find(query).sort("created_at", -1).to_list(500)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/requests")
async def admin_requests(
    user: dict = Depends(get_current_user),
    type: str = Query(None, description="Filter by type: 'reimbursement' or 'payment'")
):
    # Admin sees all requests from the current month onwards
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
        
    month_start = get_current_month_start()
    # Focus on Pending/Approved/Rejected requests created this month or later
    query = {"created_at": {"$gte": month_start}, "status": {"$ne": "Paid"}}
    
    if type in ["reimbursement", "payment"]:
        query["type"] = type
        
    recs = await requests_collection.find(query).sort("created_at", -1).to_list(500)
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
    
    return {"reimbursement_pending": r_count, "payment_pending": p_count}

@app.patch("/admin/requests/{request_id_or_oid}")
async def update_status(request_id_or_oid: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
        
    # Build query to find the document by request_id (PRxxxx) or internal _id (ObjectId)
    query = {}
    
    # Check if it matches the unique request ID format (e.g., PR0001)
    if re.match(r"PR\d{4}$", request_id_or_oid):
        query = {"request_id": request_id_or_oid}
    else:
        # Otherwise, assume it's an ObjectId
        try:
            oid = ObjectId(request_id_or_oid)
            query = {"_id": oid}
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request identifier format")
    
    doc = await requests_collection.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Request ID not found")


    status_val = payload.get("status")
    if status_val not in ["Pending", "Approved", "Rejected", "Paid"]:
        raise HTTPException(status_code=400, detail="Invalid status value provided")

    update_doc = {"status": status_val}
    current_time = datetime.now(timezone.utc) # Use timezone-aware time
    
    # --- Status Transition Logic ---
    if status_val == "Paid":
        update_doc["paid_date"] = current_time
        # If jumping straight from Pending/Rejected to Paid, set an approved date
        if doc.get("status") in ["Pending", "Rejected"] or doc.get("approved_date") is None:
            update_doc["approved_date"] = current_time
    elif status_val == "Approved":
        update_doc["approved_date"] = current_time
        # If changing back to Approved, clear paid date
        update_doc["paid_date"] = None
    
    update_operation = {"$set": {k:v for k,v in update_doc.items() if v is not None}}
    
    # Clear date fields if setting back to Pending or Rejected
    unset_fields = {}
    if status_val in ["Rejected", "Pending"]:
        unset_fields.update({"paid_date": "", "approved_date": ""})
    else:
        # Handle explicit unsetting of Paid Date if status is Approved
        if update_doc.get("paid_date") is None and status_val == "Approved":
            unset_fields["paid_date"] = ""
    
    if unset_fields:
        update_operation["$unset"] = unset_fields

    result = await requests_collection.update_one(query, update_operation)
    
    if result.matched_count == 0:
        # This shouldn't happen if `doc` was found, but it's a safety check
        raise HTTPException(status_code=404, detail="Request ID not found during update")
        
    return {"message": f"Status updated to {status_val}"}

# --- History & Records Endpoints ---
@app.get("/history_requests")
async def get_history_requests(user: dict = Depends(get_current_user)):
    # Staff see all their requests (all time). Admin see all requests (all time).
    query = {}
    if user["role"] == "staff":
        query["staffName"] = user["username"]
        
    # Sort by creation date descending
    recs = await requests_collection.find(query).sort("created_at", -1).to_list(None)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

@app.get("/admin/paid_records")
async def get_admin_record(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
        
    # Only records that have been paid (status: Paid)
    query = {"status": "Paid"}
    recs = await requests_collection.find(query).sort("paid_date", -1).to_list(None)
    recs = [serialize_doc(r) for r in recs]
    return JSONResponse(content=recs)

# --- Logout Endpoint (Optional, as token is self-contained) ---
@app.post("/logout")
async def logout():
    # Frontend handles token removal. This is just for completeness.
    return {"message": "Logged out successfully"}

# === Serve Attachments with Authorization (FIXED for Header and Query Param) ===
@app.get("/attachments/{filename}")
async def get_attachment(filename: str, request: Request):
    
    # 1. Get Token from Header or Query Parameter
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip()
    
    # If not found in Header, check Query Parameter (Needed for <img> or <a> target="_blank")
    if not token:
        token = request.query_params.get("token")
        
    if not token:
        # 401: No token was provided in either location
        raise HTTPException(status_code=401, detail="Authentication required (Token missing)")
        
    # 2. Authenticate User using the found token
    try:
        # Call get_current_user with token directly (as modified previously)
        user = await get_current_user(token=token)
    except HTTPException as e:
        # Catch exceptions thrown by get_current_user (401/403)
        if e.status_code in [401, 403]:
            # Use 403 Forbidden if token validation failed after being provided
            raise HTTPException(status_code=403, detail="Invalid or expired token, or role mismatch.")
        raise 

    # 3. Find the Document in DB
    doc = await requests_collection.find_one({"proof_filename": filename})
    if not doc:
        raise HTTPException(status_code=404, detail="Attachment record not found in database")
        
    # 4. Authorization Logic: Admin can view all, Staff can view their own
    if user["role"] != "admin" and doc["staffName"] != user["username"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this attachment (Not owner or Admin)")
        
    # 5. Serve File
    file_path = os.path.join(upload_path, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on server storage")
        
    # Determine MIME type for the browser
    content_type = "application/pdf"
    if file_path.lower().endswith((".jpg", ".jpeg")):
        content_type = "image/jpeg"
    elif file_path.lower().endswith(".png"):
        content_type = "image/png"
        
    # Serve as preview (inline), not forced download
    return FileResponse(file_path, media_type=content_type, filename=filename)