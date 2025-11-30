// ---------- Delay Helper ----------
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ---------- State ----------
let token = null;
let currentRole = null;
let currentActiveSection = 'login-form-section'; // តាមដាន Section ដែលកំពុងបើក

// ---------- Welcome Animation ----------
async function runWelcomeSequence() {
    const companyName = document.getElementById("companyName");
    const welcomeText = document.getElementById("welcomeText");
    const logoBig = document.getElementById("logoBig");
    const welcomeScreen = document.getElementById("welcome-screen");

    // ត្រូវតែបង្ហាញ Menu Toggle ត្រឹមត្រូវនៅពេលចូល Login Screen
    updateNavVisibility(null); 
    
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
        // ប្តូរទៅ Login Form
        switchToSection("login-form-section");
    }, 1000);
}

// 🟢 NEW: Core Navigation Function (ជំនួស showSection ចាស់) 🟢
/**
 * ផ្លាស់ប្តូរការបង្ហាញ Sections នៅក្នុង Single Page Application (SPA)
 * @param {string} targetId - ID របស់ Section ដែលត្រូវបង្ហាញ
 */
function switchToSection(targetId) {
    // 1. លាក់ Sections ទាំងអស់
    document.querySelectorAll('.main-content-section').forEach(section => {
        section.classList.add('is-hidden');
    });

    // 2. បង្ហាញ Section គោលដៅ
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.remove('is-hidden');
        currentActiveSection = targetId;

        // 3. ដំណើរការ Logic របស់ Section នោះ (ជំនួស Logic ដែលធ្លាប់នៅក្នុង .nav-btn listener)
        if (!token) { /* គ្មានសកម្មភាព */ return; }
        
        if (targetId === "home") {
            if (currentRole === 'admin') { setAdminHomeUI(); loadPendingRequestsSummary(); }
            else { setStaffHomeUI(); loadStaffPendingRequests(); }
        }
        else if (targetId === "reimbursement") {
            document.getElementById("reimbursementForm").style.display = (token && currentRole === 'staff') ? "block" : "none";
            if (token && currentRole === 'staff') loadMyRequests();
        }
        else if (targetId === "payment") {
            document.getElementById("paymentForm").style.display = (token && currentRole === 'staff') ? "block" : "none";
            if (token && currentRole === 'staff') loadMyPaymentRequests();
        }
        else if (targetId === "admin") {
            if (currentRole !== "admin") return;
            loadAdminUsers();
        }
        else if (targetId === "admin-review-main") {
            if (currentRole !== "admin") return;
            // ត្រូវប្រាកដថា Tab ទីមួយត្រូវបានផ្ទុក
            showAdminReviewTable('reimbursement');
        }
        else if (targetId === "history") {
            loadHistoryRequests(); 
            // ត្រូវប្រាកដថា tab-button.active ត្រូវបាន set ត្រឹមត្រូវ 
            showHistoryTable('reimbursement', document.querySelector('#history .tab-button.active'));
        }
        else if (targetId === "record") {
            if (currentRole !== "admin") return;
            loadRecordRequests(); 
            // ត្រូវប្រាកដថា tab-button.active ត្រូវបាន set ត្រឹមត្រូវ 
            showRecordTable('reimbursement', document.querySelector('#record .tab-button.active'));
        }
    }
}
// 🟢 End Core Navigation Function 🟢

function authHeaders() { return token ? { "Authorization": `Bearer ${token}` } : {}; }
function handleUnauthorized(res) { if (res.status === 401) { logout(); return true; } return false; }

// === Attachment Helper (Backend URL) ===
function proofLink(r) { 
    // ប្រើ proof_full_url ដែលបានមកពី Backend (main.py)
    if (r.proof_full_url) return r.proof_full_url;
    // Fallback ទៅ relative path
    return r.proof_filename ? `/attachments/${r.proof_filename}` : ""; 
}
// =======================================

// === NEW: Securely fetch attachment and return a Blob URL (Uses relative path for Auth) ===
async function getAuthenticatedAttachmentUrl(filename) {
    if (!filename || !token) return null;
    // ប្រើ /attachments/{filename} endpoint ដែលមាន Auth check នៅ Backend
    const url = `/attachments/${filename}`; 
    try {
        const res = await fetch(url, { headers: authHeaders() });
        if (handleUnauthorized(res)) return null;
        if (!res.ok) {
            console.error(`Failed to fetch attachment: ${res.status}`);
            return null;
        }
        
        // 1. ទទួលបាន Blob និង Content Type
        const blob = await res.blob();
        
        // 2. បង្កើត Blob URL
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Error fetching attachment:", e);
        return null;
    }
}
// ==========================================================

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

// 🟢 NEW: Function សម្រាប់គ្រប់គ្រងការបង្ហាញ Menu តាមតួនាទី (ប្រើក្នុងការ Login/Logout) 🟢
function updateNavVisibility(role) {
    const isStaff = role === 'staff';
    const isAdmin = role === 'admin';
    const isLoggedIn = isStaff || isAdmin;

    // --- Desktop Menu Visibility ---
    document.getElementById('reimbursementBtn').style.display = isStaff ? 'block' : 'none';
    document.getElementById('paymentBtn').style.display = isStaff ? 'block' : 'none';
    document.getElementById('historyMenuBtn').style.display = isStaff ? 'block' : 'none';

    document.getElementById('adminDivider').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminReviewBtn').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('recordMenuBtn').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('adminMenuBtn').style.display = isAdmin ? 'block' : 'none';

    document.getElementById('logoutBtn').style.display = isLoggedIn ? 'block' : 'none';
    
    // --- Mobile Menu Toggle Visibility ---
    document.getElementById('menuToggleBtn').style.display = isLoggedIn ? 'block' : 'none';

    // --- Home Section Content Visibility ---
    document.getElementById('admin-pending-review').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('staff-pending-reimbursement').style.display = isStaff ? 'block' : 'none';
    document.getElementById('staff-pending-payment').style.display = isStaff ? 'block' : 'none';
    
    // បិទ Mobile Menu វិញ នៅពេល Role ផ្លាស់ប្តូរ (សំខាន់!)
    document.getElementById('mobileMenu').classList.remove('is-open');
}
// 🟢 End updateNavVisibility 🟢


// 🟢 REMOVED: document.querySelectorAll(".nav-btn") listener ត្រូវបានបំបែកទៅជា:
// 1. switchToSection(targetId) function
// 2. setupEventListeners (ខាងក្រោម)
// 🟢


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

// ---------- Login / Logout ----------
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("loginMessage");
    msg.textContent = "";
    const username = document.getElementById("username")?.value.trim();
    const password = document.getElementById("password")?.value;
    const form = new FormData();
    form.append("username", username); form.append("password", password);
    try {
        const res = await fetch("/token", { method: "POST", body: form });
        if (!res.ok) { msg.textContent = "Login failed."; return; }
        const data = await res.json();
        token = data.access_token;
        let payload = null;
        try { payload = JSON.parse(atob(token.split(".")[1])); }
        catch { msg.textContent = "Invalid token."; return; }
        currentRole = payload.role;
        
        // 🟢 NEW: ប្រើ updateNavVisibility ជំនួស Logic បង្ហាញ Menu ចាស់
        updateNavVisibility(currentRole);
        // 🟢
        
        switchToSection("home");
        
    } catch { msg.textContent = "Login failed."; }
});

// 🟢 NEW: Add Event Listener for Logout Button 🟢
document.getElementById("logoutBtn")?.addEventListener("click", logout);
// 🟢

function logout() {
    token = null; currentRole = null;
    
    // 🟢 NEW: ប្រើ updateNavVisibility ជំនួស Logic លាក់ Menu ចាស់
    updateNavVisibility(null);
    // 🟢
    
    switchToSection("login-form-section");
    document.getElementById("reimbursementForm").style.display = "none";
    document.getElementById("paymentForm").style.display = "none";
    document.querySelectorAll("tbody").forEach(el => el.innerHTML = "");
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

// === renderAdminReviewRow - កែ View Proof ទៅ View ===
function renderAdminReviewRow(r,type) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${escapeHTML(r.type)}</td>
        <td>${escapeHTML(r.request_id||'N/A')}</td>
        <td>${escapeHTML(r.staffName)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${escapeHTML(r.description||r.purpose)}</td>
        <td>$${escapeHTML(r.amount)}</td>
        <td>${statusBadge(r)}</td>
        <td>${r.proof_filename?`<button type="button" class="btn-solid view-proof-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View</button>`:'N/A'}</td>
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
    
    // 🆕 Modal show (View Proof) - បង្ហាញតែ Attachment
    if(e.target.classList.contains('view-proof-btn')){
        const rec = JSON.parse(decodeURIComponent(e.target.getAttribute('data-record')));
        showRequestDetailsModal(rec, true); // 👈 true = Show only Proof
    }
    // 🆕 Modal show (View Invoice) - បង្ហាញព័ត៌មានពេញលេញ
    if(e.target.classList.contains('view-invoice-btn')){
        const rec = JSON.parse(decodeURIComponent(e.target.getAttribute('data-record')));
        showRequestDetailsModal(rec, false); // 👈 false = Show Full Invoice
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
async function updateStatus(id, status, type){try{
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
}catch(e){alert(`Failed to update status. Details: ${e.message||"Check console for server response."}`);}}

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

// === renderRow - កែ View Proof ទៅ View ===
function renderRow(r,type){
    const row=document.createElement('tr');
    row.innerHTML=`
        <td>${escapeHTML(r.type)}</td>
        <td>${escapeHTML(r.request_id||'N/A')}</td>
        <td>${escapeHTML(r.staffName)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${escapeHTML(type==="reimbursement"?r.description:r.purpose||r.description)}</td>
        <td>$${escapeHTML(r.amount)}</td>
        <td>${statusBadge(r)}</td>
        <td>${r.proof_filename?`<button type="button" class="btn-solid view-proof-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View</button>`:'N/A'}</td>
        <td><button type="button" class="btn-solid view-invoice-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View Invoice</button></td>
    `
    return row;
}

// ---------- Paid Record ----------
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
    try{
        const res=await fetch("/admin/paid_records",{headers:authHeaders()});
        if(handleUnauthorized(res))return;
        const data=await res.json();
        const filtered = data.filter(r=>r.type===type);
        tbody.innerHTML="";
        if(!filtered.length){tbody.innerHTML=`<tr><td colspan='9'>No paid ${type} records found.</td></tr>`;return;}
        filtered.forEach(r=>{
            const row=document.createElement('tr');
            // === loadRecordRequestsTab - កែ View Proof ទៅ View ===
            row.innerHTML=`
                <td>${escapeHTML(r.type)}</td>
                <td>${escapeHTML(r.request_id||'N/A')}</td>
                <td>${escapeHTML(r.staffName)}</td>
                <td>${formatDate(r.date)}</td>
                <td>${escapeHTML(type==="reimbursement"?r.description:r.purpose||r.description)}</td>
                <td>$${escapeHTML(r.amount)}</td>
                <td>${formatDate(r.paid_date)}</td>
                <td>${r.proof_filename?`<button type="button" class="btn-solid view-proof-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View</button>`:'N/A'}</td>
                <td><button type="button" class="btn-solid view-invoice-btn" data-record='${encodeURIComponent(JSON.stringify(r))}'>View Invoice</button></td>
            `
            tbody.appendChild(row);
        });
    }catch{
        tbody.innerHTML="<tr><td colspan='9'>Failed to load records.</td></tr>";
    }
}

// ---------- Modal logic (Updated to include Open Attachment link for View Proof) ----------
async function showRequestDetailsModal(r, showOnlyProof = false){ 
    const modal=document.getElementById('proofModal');
    // ប្រើ ID ដើមរបស់អ្នក៖ modalHeaderContent
    const modalHeaderContent = document.getElementById('modalHeaderContent'); 
    const modalDetails=document.getElementById('modalDetails');
    const proofFrame=document.getElementById('proofFrame');
    const applicationTitle=document.getElementById('applicationTitle');
    
    // Clear details and initially set display modes
    modalDetails.innerHTML = ''; 
    modalDetails.style.display = 'none'; 
    const proofFilename = r.proof_filename;

    // Logic គ្រប់គ្រង Header និង Details
    if (!showOnlyProof) { 
        // ពេល View Invoice: បង្ហាញ Header និង Details ទាំងអស់
        modalHeaderContent.style.display = 'flex'; 
        modalDetails.style.display = 'block'; 
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
        // បន្ថែម Open in New Tab Link សម្រាប់ Full Invoice View (បើមាន Attachment)
        if (proofFilename) {
            modalDetails.innerHTML += `<p class="modal-link-container"><a href="${proofLink(r)}" target="_blank" rel="noopener noreferrer">Open Attachment in New Tab</a></p>`;
        }
    } else {
        // ពេល View Proof តែប៉ុណ្ណោះ: លាក់ Header (Logo/Company Name)
        modalHeaderContent.style.display = 'none'; 
        applicationTitle.textContent=`ATTACHMENT PROOF — ${r.request_id||''}`; 

        // 🆕 បន្ថែម Open in New Tab Link សម្រាប់ View Proof (បើមាន Attachment)
        modalDetails.style.display = 'block'; // ត្រូវតែបង្ហាញ details ដើម្បីដាក់ link
        if (proofFilename) {
             modalDetails.innerHTML += `<p class="modal-link-container" style="text-align:center;"><a href="${proofLink(r)}" target="_blank" rel="noopener noreferrer">Open Attachment in New Tab</a></p>`;
        }
    }

    
    if(proofFilename){
        // រង់ចាំទាញយកឯកសារដែលមាន Authentication
        const authenticatedUrl = await getAuthenticatedAttachmentUrl(proofFilename); 

        if (authenticatedUrl) {
            proofFrame.src = authenticatedUrl;
            proofFrame.style.display='block';
        } else {
            proofFrame.src="";
            proofFrame.style.display='none';
            // បង្ហាញ error នៅក្នុង mode ទាំងពីរពេល load មិនបាន
            modalDetails.style.display = 'block'; 
            modalDetails.innerHTML+=`<p style="color:red;padding-top:20px;">Failed to load attachment (Check Authentication or Console for error).</p>`;
        }
    }
    else{
        proofFrame.src="";
        proofFrame.style.display='none';
        // បង្ហាញ No attachment នៅក្នុង mode ទាំងពីរ
        modalDetails.style.display = 'block';
        modalDetails.innerHTML+=`<p style="color:red;padding-top:20px;">No attachment/proof file found.</p>`;
    }
    modal.classList.remove('is-hidden');
}

function hideRequestDetailsModal(){
    const modal=document.getElementById('proofModal');
    const proofFrame=document.getElementById('proofFrame');
    modal.classList.add('is-hidden');
    
    // លុប Blob URL ចេញពីអង្គចងចាំនៅពេលបិទ Modal
    if (proofFrame.src && proofFrame.src.startsWith('blob:')) {
        URL.revokeObjectURL(proofFrame.src);
        proofFrame.src = "";
    }
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideRequestDetailsModal();});

// ---------- Admin User Management ----------
async function loadAdminUsers(){
    const tbody=document.querySelector("#usersTable tbody");
    tbody.innerHTML="<tr><td colspan='4'>Loading users...</td></tr>";
    try{
        const res=await fetch("/admin/users",{headers:authHeaders()});
        if(handleUnauthorized(res))return;
        const data=await res.json();
        tbody.innerHTML=data.length?"":"<tr><td colspan='4'>No users found</td></tr>";
        data.forEach(u=>{
            const row=document.createElement('tr');
            row.innerHTML=`
                <td>${escapeHTML(u.username)}</td>
                <td>${escapeHTML(u.role)}</td>
                <td>${formatDate(u.created_at)}</td>
                <td><button class="delete-btn" data-username="${escapeHTML(u.username)}">Delete</button></td>
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
        await loadAdminUsers();
    }catch{alert("Failed to delete user.");}
}
document.getElementById("addUserForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    try{
        const res=await fetch("/create_user",{method:"POST",headers:authHeaders(),body:fd});
        if(handleUnauthorized(res))return;
        if(!res.ok){
            const msg=await res.json().catch(()=>({}));
            document.getElementById("createUserMessage").textContent = msg.detail || "Failed to create user.";
            return;
        }
        await res.json();
        e.target.reset();
        document.getElementById("createUserMessage").textContent="User created successfully!";
        await loadAdminUsers();
    }catch{
        document.getElementById("createUserMessage").textContent="Error creating user.";
    }
});

// 🟢 NEW: Setup Mobile Menu Logic 🟢
function setupMobileMenu() {
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const desktopNavLinks = document.getElementById('desktopNavLinks');

    menuToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        mobileMenu.classList.toggle('is-open');

        // កសាង Menu ឡើងវិញរាល់ពេលបើក ដើម្បីធានាថាវា Update តាម Role ថ្មី
        if (mobileMenu.classList.contains('is-open')) {
            
            mobileMenu.innerHTML = ''; // សម្អាត Menu ចាស់
            
            const links = Array.from(desktopNavLinks.children);
            
            links.forEach(link => {
                // យកតែ buttons ដែលត្រូវបានបង្ហាញសម្រាប់តួនាទីបច្ចុប្បន្ន
                // និងមិនមែនជា nav-divider
                if (link.tagName === 'BUTTON' && link.style.display !== 'none') {
                    const clone = link.cloneNode(true);
                    
                    clone.style.display = 'block'; 
                    clone.classList.remove('btn-secondary'); 
                    clone.classList.add('nav-btn'); 

                    clone.addEventListener('click', () => {
                        const targetId = clone.dataset.target;
                        if (targetId) {
                            switchToSection(targetId);
                        }
                        // បិទ menu បន្ទាប់ពីចុច
                        mobileMenu.classList.remove('is-open');
                    });

                    mobileMenu.appendChild(clone);
                }
            });
        }
    });

    // បិទ menu នៅពេលចុចក្រៅ menu
    document.addEventListener('click', (e) => {
        if (!mobileMenu.contains(e.target) && e.target !== menuToggleBtn) {
            mobileMenu.classList.remove('is-open');
        }
    });
}

// 🟢 NEW: Setup Desktop Navigation Logic 🟢
function setupEventListeners() {
    // --- Desktop Navigation Listener (for nav-links) ---
    document.querySelectorAll('.nav-links .nav-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            if (targetId) {
                switchToSection(targetId);
            }
        });
    });
    // --- Logout is already handled above in the global scope listener ---
}


// ---------- Initialize ----------
document.addEventListener('DOMContentLoaded', () => {
    // 1. កំណត់រចនាសម្ព័ន្ធ Menu របស់ទូរស័ព្ទ
    setupMobileMenu();

    // 2. កំណត់រចនាសម្ព័ន្ធ Event Listeners
    setupEventListeners();
    
    // 3. ចាប់ផ្តើម Animation នៃការស្វាគមន៍
    runWelcomeSequence();
});