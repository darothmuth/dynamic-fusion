// ---------- Delay Helper ----------
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ---------- State ----------
let token = null;
let currentRole = null;

// ---------- Helpers (Show/Hide Section) ----------
function showSection(id) {
    const allSections = [
        "login-form-section", "home", "reimbursement", "payment", "admin",
        "admin-review-main", "history", "record"
    ];
    allSections.forEach(sec => {
        const el = document.getElementById(sec);
        if (el) el.classList.add("is-hidden");
    });
    const targetEl = document.getElementById(id);
    if (targetEl) targetEl.classList.remove("is-hidden");
    document.getElementById("mainMenu")?.classList.add("is-hidden");
}
function authHeaders() { return token ? { "Authorization": `Bearer ${token}` } : {}; }
function handleUnauthorized(res) { if (res.status === 401) { logout(); return true; } return false; }

// --- FIXED: proofLink now includes the token as a query parameter ---
function proofLink(r) {
    if (r.proof_full_url) return r.proof_full_url;
    if (r.proof_filename && token) {
        // Appends the token as a query parameter so the link works directly in the browser
        return `/attachments/${r.proof_filename}?token=${token}`; 
    }
    return r.proof_filename ? `/attachments/${r.proof_filename}` : ""; 
}
// --- REMOVED: getAuthenticatedAttachmentUrl function is no longer needed ---

function formatDate(dateString) {
    if (!dateString) return '';
    if (dateString.includes('T')) dateString = dateString.split('T')[0];
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
}
function getApplicationTitle(type) { return type === 'reimbursement' ? 'Reimbursement Request Application' : 'Payment Request Application'; }
function statusBadge(r) {
    const s = r.status;
    if (s === 'Paid') return `<span class="status-paid">Complete (${formatDate(r.paid_date)})</span>`;
    if (s === 'Approved') return `<span class="status-approved">${s}</span>`;
    if (s === 'Rejected') return `<span class="status-rejected">${s}</span>`;
    return `<span class="status-pending">${s}</span>`;
}
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"'`]/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;', '`': '&#96;'
    }[s]));
}

// ---------- Welcome Animation ----------
async function runWelcomeSequence() {
    const welcomeScreen = document.getElementById("welcome-screen");
    const loginFormSection = document.getElementById("login-form-section");
    const companyName = document.getElementById("companyName");
    const welcomeText = document.getElementById("welcomeText");
    const logoBig = document.getElementById("logoBig");
    if (!welcomeScreen || !logoBig || !companyName || !welcomeText || !loginFormSection) {
        if (welcomeScreen) welcomeScreen.classList.add("is-hidden");
        showSection("login-form-section");
        return;
    }
    try {
        logoBig.style.display = 'block';
        logoBig.classList.add("logo-fly");
        await delay(2000);
        logoBig.classList.add("logo-hide");
        await delay(1000);
        companyName.textContent = "DYNAMIC FUSION CO., LTD";
        companyName.classList.add("typing");
        await delay(2000);
        welcomeText.textContent = "Staff Reimbursement & Payment Portal";
        welcomeText.classList.add("typing");
        await delay(1000);
        welcomeScreen.classList.add("fade-out");
        setTimeout(() => {
            welcomeScreen.classList.add("is-hidden");
            showSection("login-form-section");
        }, 1000);
    } catch (e) {
        if (welcomeScreen) welcomeScreen.classList.add("is-hidden");
        showSection("login-form-section");
    }
}

// ---------- Navbar UI ----------
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        if (!token) { showSection("login-form-section"); return; }
        if (target === "home") {
            showSection("home");
            if (currentRole === 'admin') { setAdminHomeUI(); loadPendingRequestsSummary(); }
            else { setStaffHomeUI(); loadStaffPendingRequests(); }
        }
        else if (target === "reimbursement") {
            showSection("reimbursement");
            document.getElementById("reimbursementForm").style.display = (token && currentRole === 'staff') ? "block" : "none";
            if (token && currentRole === 'staff') loadMyRequests();
        }
        else if (target === "payment") {
            showSection("payment");
            document.getElementById("paymentForm").style.display = (token && currentRole === 'staff') ? "block" : "none";
            if (token && currentRole === 'staff') loadMyPaymentRequests();
        }
        else if (target === "admin") {
            if (currentRole !== "admin") return;
            showSection("admin"); loadAdminUsers();
        }
        else if (target === "admin-review-main") {
            if (currentRole !== "admin") return;
            showSection("admin-review-main");
            showAdminReviewTable('reimbursement');
        }
        else if (target === "history") {
            showSection("history");
            loadHistoryRequests(); showHistoryTable('reimbursement', document.querySelector('#history .tab-button.active'));
        }
        else if (target === "record") {
            if (currentRole !== "admin") return;
            showSection("record");
            loadRecordRequests(); showRecordTable('reimbursement', document.querySelector('#record .tab-button.active'));
        }
    });
});
function setAdminHomeUI() {
    document.getElementById("home-title").textContent = "Admin Pending Review Summary";
    document.getElementById("staff-pending-reimbursement").style.display = 'none';
    document.getElementById("staff-pending-payment").style.display = 'none';
    document.getElementById("admin-pending-review").style.display = 'block';
}
function setStaffHomeUI() {
    document.getElementById("home-title").textContent = "Your Pending Requests";
    document.getElementById("staff-pending-reimbursement").style.display = 'block';
    document.getElementById("staff-pending-payment").style.display = 'block';
    document.getElementById("admin-pending-review").style.display = 'none';
}
document.querySelector(".menu-toggle")?.addEventListener("click", () => {
    document.getElementById("mainMenu")?.classList.toggle("is-hidden");
});
document.addEventListener("click", (e) => {
    const menu = document.getElementById("mainMenu");
    const toggle = document.querySelector(".menu-toggle");
    if (!menu || !toggle) return;
    if (!menu.contains(e.target) && e.target !== toggle) {
        menu.classList.add("is-hidden");
    }
});

// ---------- Login / Logout ----------
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("loginMessage");
    if (msg) msg.textContent = "";
    const username = document.getElementById("username")?.value.trim();
    const password = document.getElementById("password")?.value;
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    try {
        const res = await fetch("/token", { method: "POST", body: form });
        if (!res.ok) {
            if (msg) msg.textContent = "Login failed. Incorrect username or password.";
            return;
        }
        const data = await res.json();
        token = data.access_token;
        let payload = null;
        try { payload = JSON.parse(atob(token.split(".")[1])); }
        catch { if (msg) msg.textContent = "Invalid token."; return; }
        currentRole = payload.role;
        document.getElementById("login-form-section").classList.add("is-hidden");
        const isAdmin = currentRole === "admin";
        document.getElementById("logoutBtn").style.display = "inline-block";
        document.getElementById("historyMenuBtn").style.display = "inline-block";
        document.getElementById("adminMenuBtn").style.display = isAdmin ? "inline-block" : "none";
        document.getElementById("recordMenuBtn").style.display = isAdmin ? "inline-block" : "none";
        document.getElementById("adminReviewBtn").style.display = isAdmin ? "inline-block" : "none";
        document.getElementById("reimbursementBtn").style.display = isAdmin ? "none" : "inline-block";
        document.getElementById("paymentBtn").style.display = isAdmin ? "none" : "inline-block";
        document.getElementById("mainMenu").classList.remove("is-hidden");
        showSection("home");
        if (isAdmin) {
            setAdminHomeUI();
            loadPendingRequestsSummary();
        } else {
            setStaffHomeUI();
            loadStaffPendingRequests();
        }
    } catch (error) {
        if (msg) msg.textContent = "Login failed due to server error.";
    }
});
document.getElementById("logoutBtn")?.addEventListener("click", logout);
function logout() {
    token = null; currentRole = null;
    ["logoutBtn","adminMenuBtn","recordMenuBtn","adminReviewBtn","historyMenuBtn","reimbursementBtn","paymentBtn"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
    document.getElementById("admin-pending-review").style.display = "none";
    document.querySelectorAll("tbody").forEach(el => el.innerHTML = "");
    showSection("login-form-section");
    document.getElementById("mainMenu").classList.add("is-hidden");
}

// ---------- Staff submit forms ----------
document.getElementById("reimbursementForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
        const res = await fetch("/submit_reimbursement", { method: "POST", headers: authHeaders(), body: fd });
        if (handleUnauthorized(res)) return;
        if (!res.ok) throw new Error("Submit failed");
        await res.json();
        e.target.reset();
        alert("Reimbursement submitted successfully!");
        await loadMyRequests();
        if (!document.getElementById("home").classList.contains("is-hidden")) {
            loadStaffPendingRequests();
        }
    } catch {
        alert("Failed to submit reimbursement.");
    }
});
document.getElementById("paymentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
        const res = await fetch("/submit_payment", { method: "POST", headers: authHeaders(), body: fd });
        if (handleUnauthorized(res)) return;
        if (!res.ok) throw new Error("Submit failed");
        await res.json();
        e.target.reset();
        alert("Payment Request submitted successfully!");
        await loadMyPaymentRequests();
        if (!document.getElementById("home").classList.contains("is-hidden")) {
            loadStaffPendingRequests();
        }
    } catch {
        alert("Failed to submit payment request.");
    }
});

// ---------- Table & Tab Loading ----------
async function loadMyRequests() {
    const tbody = document.querySelector("#recordsTable tbody");
    tbody.innerHTML = "<tr><td colspan='9'>Loading...</td></tr>";
    try {
        const res = await fetch("/my_requests", { headers: authHeaders() });
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        const reimbursements = data.filter(r => r.type === "reimbursement");
        tbody.innerHTML = "";
        if (!reimbursements.length) {
            tbody.innerHTML = "<tr><td colspan='9'>No reimbursement requests yet</td></tr>";
            return;
        }
        reimbursements.forEach(r => tbody.appendChild(renderRow(r, "reimbursement")));
    } catch {
        tbody.innerHTML = "<tr><td colspan='9'>Failed to load requests</td></tr>";
    }
}
async function loadMyPaymentRequests() {
    const tbody = document.querySelector("#paymentsTable tbody");
    tbody.innerHTML = "<tr><td colspan='9'>Loading...</td></tr>";
    try {
        const res = await fetch("/my_requests", { headers: authHeaders() });
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        const payments = data.filter(r => r.type === "payment");
        tbody.innerHTML = "";
        if (!payments.length) {
            tbody.innerHTML = "<tr><td colspan='9'>No payment requests yet</td></tr>";
            return;
        }
        payments.forEach(r => tbody.appendChild(renderRow(r, "payment")));
    } catch {
        tbody.innerHTML = "<tr><td colspan='9'>Failed to load payment requests</td></tr>";
    }
}

// ---------- Staff Home pending ----------
async function loadStaffPendingRequests() {
    if (currentRole !== 'staff') return;
    const rTbody = document.querySelector("#staffPendingReimbursementTable tbody");
    const pTbody = document.querySelector("#staffPendingPaymentTable tbody");
    rTbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
    pTbody.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
    try {
        const res = await fetch("/my_requests", { headers: authHeaders() });
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        const pendingReimbursements = data.filter(r => r.type === "reimbursement" && r.status === "Pending");
        const pendingPayments = data.filter(r => r.type === "payment" && r.status === "Pending");
        rTbody.innerHTML = "";
        pTbody.innerHTML = "";
        if (!pendingReimbursements.length) rTbody.innerHTML = "<tr><td colspan='9'>No pending reimbursement requests.</td></tr>";
        else pendingReimbursements.forEach(r=>rTbody.appendChild(renderRow(r,"reimbursement")));
        if (!pendingPayments.length) pTbody.innerHTML = "<tr><td colspan='9'>No pending payment requests.</td></tr>";
        else pendingPayments.forEach(r=>pTbody.appendChild(renderRow(r,"payment")));
    } catch (e) {
        rTbody.innerHTML = "<tr><td colspan='9'>Failed to load pending requests.</td></tr>";
        pTbody.innerHTML = "<tr><td colspan='9'>Failed to load pending requests.</td></tr>";
    }
}

// ---------- Admin Notification ----------
async function loadPendingRequestsSummary() {
    const summaryText = document.getElementById("notificationText");
    const adminPendingReviewContainer = document.getElementById("admin-pending-review");
    if (adminPendingReviewContainer) adminPendingReviewContainer.style.display = 'none';
    if (currentRole !== 'admin') return;
    try {
        const res = await fetch("/admin/pending_summary", { headers: authHeaders() });
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        const totalPending = data.reimbursement_pending + data.payment_pending;
        summaryText.innerHTML = totalPending > 0
            ? `<p>⚠️ <strong>Attention Admin:</strong> There are <strong>${totalPending}</strong> pending requests awaiting review:</p>
                <ul><li><strong>${data.reimbursement_pending}</strong> Reimbursement Requests</li>
                    <li><strong>${data.payment_pending}</strong> Payment Requests</li></ul>
                <p>Click <strong>Review Requests</strong> in the menu to take action.</p>`
            : `<p>✅ Great job! There are currently no pending requests to review.</p>`;
        if (adminPendingReviewContainer) adminPendingReviewContainer.style.display = 'block';
    } catch{}
}

// ---------- Admin Review ----------
function showAdminReviewTable(type) {
    document.getElementById('admin-reimbursement-panel').classList.add('is-hidden');
    document.getElementById('admin-payment-panel').classList.add('is-hidden');
    const targetElement = document.getElementById(`admin-${type}-panel`);
    if (targetElement) {
        targetElement.classList.remove('is-hidden');
        loadAdminRequests(type);
    }
    document.querySelectorAll('#admin-review-main .tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(type)) btn.classList.add('active');
    });
}
async function loadAdminRequests(type){
    const tbody=document.querySelector(type==='reimbursement'?"#adminReimbursementTable tbody":"#adminPaymentTable tbody");
    tbody.innerHTML='<tr><td colspan="10">Loading requests...</td></tr>';
    if(currentRole!=='admin'){tbody.innerHTML='<tr><td colspan="10">Access Denied.</td></tr>';return;}
    try{
        const res=await fetch(`/admin/requests?type=${type}`,{headers:authHeaders()});
        if(handleUnauthorized(res))return;
        const data=await res.json();
        tbody.innerHTML="";
        if (!data.length) {tbody.innerHTML=`<tr><td colspan='10'>No ${type} requests found for this month</td></tr>`; return;}
        data.forEach(r => tbody.appendChild(renderAdminReviewRow(r,type)));
    }catch{tbody.innerHTML=`<tr><td colspan='10'>Failed to load admin ${type} requests</td></tr>`;}
}

function renderAdminReviewRow(r,type) {
    const row = document.createElement('tr');
    // FIX HERE: use <a> for attachment! The proofLink function now handles token inclusion.
    row.innerHTML = `
        <td>${escapeHTML(r.type)}</td>
        <td>${escapeHTML(r.request_id||'N/A')}</td>
        <td>${escapeHTML(r.staffName)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${escapeHTML(r.description||r.purpose)}</td>
        <td>$${escapeHTML(r.amount)}</td>
        <td>${statusBadge(r)}</td>
        <td>${r.proof_filename?`<a href="${proofLink(r)}" target="_blank" rel="noopener" class="btn-solid">View</a>`:'N/A'}</td>
        <td><button type="button" class="btn-solid view-invoice-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View Invoice</button></td>
        <td>${reviewActionButtons(r,type)}</td>
    `;
    return row;
}

function reviewActionButtons(r,type){
    if(r.status==='Pending'){
        return `<button type="button" class="approve-btn" data-id="${r.request_id}" data-type="${type}">Approve</button>
            <button type="button" class="reject-btn" data-id="${r.request_id}" data-type="${type}">Reject</button>`;
    }
    else if(r.status==='Approved')return `<button type="button" class="paid-btn" data-id="${r.request_id}" data-type="${type}">Paid</button>`;
    else if(r.status==='Paid')return `<span class="status-paid">Complete</span>`;
    else if(r.status==='Rejected')return `<span class="status-rejected">Rejected</span>`;
    return '';
}
document.addEventListener("click", function(e){
    // Admin review action buttons
    if(e.target.classList.contains('approve-btn')) updateStatus(e.target.getAttribute("data-id"),"Approved",e.target.getAttribute("data-type"));
    if(e.target.classList.contains('reject-btn')) updateStatus(e.target.getAttribute("data-id"),"Rejected",e.target.getAttribute("data-type"));
    if(e.target.classList.contains('paid-btn')) updateStatus(e.target.getAttribute("data-id"),"Paid",e.target.getAttribute("data-type"));

    // View Invoice (modal)
    if(e.target.classList.contains('view-invoice-btn')){
        const rec = JSON.parse(decodeURIComponent(e.target.getAttribute('data-record')));
        showRequestDetailsModal(rec);
    }

    // User management delete btn
    if(e.target.classList.contains('delete-btn')) {
        const username = e.target.getAttribute("data-username");
        deleteUser(username);
    }
    // Modal close
    if(e.target.classList.contains('btn-secondary') && e.target.closest('#proofModal')) {
        hideRequestDetailsModal();
    }
});

// ---------- Update Status (Admin) ----------
async function updateStatus(id, status, type){
    try{
        const res=await fetch(`/admin/requests/${id}`,{
            method:"PATCH",headers:{"Content-Type":"application/json",...authHeaders()},
            body:JSON.stringify({status})
        });
        if(handleUnauthorized(res))return;
        if(!res.ok){
            const errorDetails=await res.json().catch(()=>({}));
            const message=errorDetails.detail||`Server responded with status ${res.status}.`;
            throw new Error(message);
        }
        await loadAdminRequests(type);loadPendingRequestsSummary();
        if(currentRole==='staff'&&!document.getElementById("home").classList.contains("is-hidden")){loadStaffPendingRequests();}
    }catch(e){alert(`Failed to update status. Details: ${e.message||"Check console for server response."}`);}
}

// ---------- History ----------
function showHistoryTable(type,button){
    document.getElementById('history-reimbursement').classList.add('is-hidden');
    document.getElementById('history-payment').classList.add('is-hidden');
    document.getElementById(`history-${type}`).classList.remove('is-hidden');
    document.querySelectorAll('#history .tab-button').forEach(btn=>btn.classList.remove('active'));
    if(button)button.classList.add('active');
    loadHistoryRequestsTab(type);
}
async function loadHistoryRequests(){
    loadHistoryRequestsTab('reimbursement');
    loadHistoryRequestsTab('payment');
}
async function loadHistoryRequestsTab(type){
    const tbody=document.querySelector(type==="reimbursement"?"#historyReimbursementTable tbody":"#historyPaymentTable tbody");
    tbody.innerHTML='<tr><td colspan="9">Loading...</td></tr>';
    try{
        const res=await fetch("/history_requests",{headers:authHeaders()});
        if (handleUnauthorized(res)) return;
        const data = await res.json();
        const filtered = data.filter(r=>r.type===type);
        tbody.innerHTML="";
        if(!filtered.length){tbody.innerHTML=`<tr><td colspan='9'>No ${type} history found.</td></tr>`;return;}
        filtered.forEach(r=>tbody.appendChild(renderRow(r,type)));
    }catch{
        tbody.innerHTML="<tr><td colspan='9'>Failed to load history.</td></tr>";
    }
}

function renderRow(r,type){
    const row=document.createElement('tr');
    // FIX HERE for attachment: The proofLink function now handles token inclusion.
    row.innerHTML=`
        <td>${escapeHTML(r.type)}</td>
        <td>${escapeHTML(r.request_id||'N/A')}</td>
        <td>${escapeHTML(r.staffName)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${escapeHTML(type==="reimbursement"?r.description:r.purpose||r.description)}</td>
        <td>$${escapeHTML(r.amount)}</td>
        <td>${statusBadge(r)}</td>
        <td>${r.proof_filename?`<a href="${proofLink(r)}" target="_blank" rel="noopener" class="btn-solid">View</a>`:'N/A'}</td>
        <td><button type="button" class="btn-solid view-invoice-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View Invoice</button></td>
    `
    return row;
}

// ---------- Paid Record (Admin) ----------
function showRecordTable(type,button){
    document.getElementById('record-reimbursement').classList.add('is-hidden');
    document.getElementById('record-payment').classList.add('is-hidden');
    document.getElementById(`record-${type}`).classList.remove('is-hidden');
    document.querySelectorAll('#record .tab-button').forEach(btn=>btn.classList.remove('active'));
    if(button)button.classList.add('active');
    loadRecordRequestsTab(type);
}
async function loadRecordRequests(){
    loadRecordRequestsTab('reimbursement');
    loadRecordRequestsTab('payment');
}
async function loadRecordRequestsTab(type){
    const tbody=document.querySelector(type==="reimbursement"?"#recordReimbursementTable tbody":"#recordPaymentTable tbody");
    tbody.innerHTML='<tr><td colspan="9">Loading...</td></tr>';
    if(currentRole !== 'admin') { tbody.innerHTML = '<tr><td colspan="9">Admin access only.</td></tr>'; return; }
    try{
        const res=await fetch("/admin/paid_records",{headers:authHeaders()});
        if(handleUnauthorized(res))return;
        const data=await res.json();
        const filtered = data.filter(r=>r.type===type);
        tbody.innerHTML="";
        if(!filtered.length){tbody.innerHTML=`<tr><td colspan='9'>No paid ${type} records found.</td></tr>`;return;}
        filtered.forEach(r=>{
            const row=document.createElement('tr');
            // FIX for paid record attachment link: The proofLink function now handles token inclusion.
            row.innerHTML=`
                <td>${escapeHTML(r.type)}</td>
                <td>${escapeHTML(r.request_id||'N/A')}</td>
                <td>${escapeHTML(r.staffName)}</td>
                <td>${formatDate(r.date)}</td>
                <td>${escapeHTML(type==="reimbursement"?r.description:r.purpose||r.description)}</td>
                <td>$${escapeHTML(r.amount)}</td>
                <td>${formatDate(r.paid_date)}</td>
                <td>${r.proof_filename?`<a href="${proofLink(r)}" target="_blank" rel="noopener" class="btn-solid">View</a>`:'N/A'}</td>
                <td><button type="button" class="btn-solid view-invoice-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View Invoice</button></td>
            `
            tbody.appendChild(row);
        });
    }catch{
        tbody.innerHTML="<tr><td colspan='9'>Failed to load records.</td></tr>";
    }
}

// ---------- Modal logic ----------
const proofModal = document.getElementById("proofModal");
const modalHeaderContent = document.getElementById('modalHeaderContent'); 
const modalDetails=document.getElementById('modalDetails');
const proofFrame=document.getElementById('proofFrame');
const applicationTitle=document.getElementById('applicationTitle');
let currentBlobUrl = null; 
async function showRequestDetailsModal(r){ 
    if(!proofModal || !modalHeaderContent || !modalDetails || !proofFrame || !applicationTitle) return; 
    const proofFilename = r.proof_filename;
    // We are no longer using currentBlobUrl to fetch/revoke blobs
    // if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) { URL.revokeObjectURL(currentBlobUrl);}
    // currentBlobUrl = null;
    modalDetails.innerHTML = ''; 
    modalDetails.style.display = 'block'; 
    proofFrame.style.display='none';
    modalHeaderContent.style.display = 'flex'; 
    applicationTitle.textContent=`${getApplicationTitle(r.type)} — ${r.request_id||''}`; 
    modalDetails.innerHTML = `
        <div class="modal-info-grid">
            <p><strong>Request Type:</strong> ${escapeHTML(r.type)}</p>
            <p><strong>Staff Name:</strong> ${escapeHTML(r.staffName)}</p>
            <p><strong>Request Date:</strong> ${formatDate(r.date)}</p>
            <p><strong>Description/Purpose:</strong> ${escapeHTML(r.description||r.purpose)}</p>
            <p><strong>Amount Requested:</strong> $${escapeHTML(r.amount)}</p>
            <p><strong>Status:</strong> ${statusBadge(r)}</p>
            <p><strong>Approved Date:</strong> ${formatDate(r.approved_date||'')}</p>
            <p><strong>Paid Date:</strong> ${formatDate(r.paid_date||'')}</p>
        </div>
    `;
    if (proofFilename) {
        // The URL now contains the necessary token via proofLink
        const url = proofLink(r); 
        modalDetails.innerHTML += `<p class="modal-link-container" style="padding-top:10px;"><a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-solid" style="display:block;text-align:center;">Open Attachment in New Tab (Recommended for Mobile)</a></p>`;
    } else {
        modalDetails.innerHTML += `<p class="modal-link-container" style="color:red;padding-top:10px;text-align:center;">No attachment/proof file found.</p>`;
    }
    proofFrame.src = "";
    proofModal.classList.remove('is-hidden');
}
function hideRequestDetailsModal(){
    if(!proofModal || !proofFrame) return;
    proofModal.classList.add('is-hidden');
    // Removed unused Blob cleanup code
    // if (currentBlobUrl && currentBlobUrl.startsWith('blob:')) {
    //     URL.revokeObjectURL(currentBlobUrl);
    // }
    proofFrame.src = "";
    currentBlobUrl = null;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideRequestDetailsModal();});

// ---------- Admin User Management ----------
async function loadAdminUsers(){
    const tbody=document.querySelector("#usersTable tbody");
    tbody.innerHTML="<tr><td colspan='4'>Loading users...</td></tr>";
    if (currentRole !== 'admin') { tbody.innerHTML = '<tr><td colspan="4">Access Denied.</td></tr>'; return; }
    try{
        const res=await fetch("/admin/users",{headers:authHeaders()});
        if(handleUnauthorized(res))return;
        const data=await res.json();
        tbody.innerHTML=data.length?"":"<tr><td colspan='4'>No users found</td></tr>";
        data.forEach(u=>{
            const row=document.createElement('tr');
            // FIX: Get the logged-in username from the JWT payload for comparison
            let loggedInUsername = '';
            try { loggedInUsername = JSON.parse(atob(token.split(".")[1])).sub; } catch {}

            const canDelete = u.username !== loggedInUsername; 
            row.innerHTML=`
                <td>${escapeHTML(u.username)}</td>
                <td>${escapeHTML(u.role)}</td>
                <td>${formatDate(u.created_at)}</td>
                <td>${canDelete ? `<button class="delete-btn" data-username="${escapeHTML(u.username)}">Delete</button>` : 'N/A'}</td>
            `;
            tbody.appendChild(row);
        });
    }catch{
        tbody.innerHTML="<tr><td colspan='4'>Failed to load users</td></tr>";
    }
}
async function deleteUser(username) {
    if(!confirm(`Delete user '${username}'?`)) return;
    try {
        const res=await fetch(`/admin/users/${username}`,{method:"DELETE",headers:authHeaders()});
        if(handleUnauthorized(res))return;
        if(!res.ok) throw new Error("Delete failed");
        alert(`User ${username} deleted successfully.`);
        await loadAdminUsers();
    }catch(e){alert(`Failed to delete user. ${e.message||"Check console."}`);}
}
document.getElementById("addUserForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const msgEl = document.getElementById("createUserMessage");
    if (msgEl) msgEl.textContent = "Processing...";
    try{
        const res=await fetch("/create_user",{method:"POST",headers:authHeaders(),body:fd});
        if(handleUnauthorized(res))return;
        if(!res.ok){
            const msg=await res.json().catch(()=>({}));
            if (msgEl) msgEl.textContent = msg.detail || "Failed to create user.";
            return;
        }
        await res.json();
        e.target.reset();
        msgEl && (msgEl.textContent="User created successfully!");
        await loadAdminUsers();
    }catch{
        msgEl && (msgEl.textContent="Error creating user.");
    }
});

// ---------- Initialize ----------
document.addEventListener('DOMContentLoaded', runWelcomeSequence);