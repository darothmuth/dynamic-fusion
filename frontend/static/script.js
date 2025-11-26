// ---------- Welcome animation (No changes) ----------
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runWelcomeSequence() {
  const companyName = document.getElementById("companyName");
  const welcomeText = document.getElementById("welcomeText");
  const logoBig = document.getElementById("logoBig");
  const welcomeScreen = document.getElementById("welcome-screen");

  logoBig.classList.add("logo-fly");
  await delay(2000);

   logoBig.classList.add("logo-hide");
   await delay(1000);
  

  companyName.textContent = "DYNAMIC FUSION CO., LTD";
  companyName.classList.add("typing");
  await delay(1000);

  welcomeText.textContent = "Staff Reimbursement & Payment Portal";
  welcomeText.classList.add("typing");
  await delay(1000);

  welcomeScreen.classList.add("fade-out");
  setTimeout(() => welcomeScreen.classList.add("is-hidden"), 1000);
}
runWelcomeSequence();

// ---------- State ----------
let token = null;
let currentRole = null;

// ---------- Helpers ----------
function showSection(id) {
  // Includes all sections AND the new login section
  ["login-form-section", "home", "reimbursement", "payment", "admin", "admin-review-main", "history", "record"].forEach(sec => {
    const el = document.getElementById(sec);
    if (el) el.classList.toggle("is-hidden", sec !== id);
  });
}
function toggleMenu(open) {
  const menu = document.querySelector(".overflow-menu");
  const btn = document.querySelector(".overflow-btn");
  menu.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}
function authHeaders() {
  return token ? { "Authorization": `Bearer ${token}` } : {};
}
function handleUnauthorized(res) {
  if (res.status === 401) {
    logout();
    return true;
  }
  return false;
}
// Formatting for date DD/MM/YYYY
function formatDate(dateString) {
  if (!dateString) return '';
  // ប្រើតែកាលបរិច្ឆេទ (YYYY-MM-DD)
  if (dateString.includes('T')) {
      dateString = dateString.split('T')[0];
  }
  const parts = dateString.split('-');
  // សន្មតទ្រង់ទ្រាយ YYYY-MM-DD
  if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString; 
}

// ---------- Navbar Event Listeners ----------
document.querySelector(".overflow-btn").addEventListener("click", () => {
  const menu = document.querySelector(".overflow-menu");
  const open = !menu.classList.contains("is-open");
  toggleMenu(open);
});

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    toggleMenu(false);

    if (!token) {
      // បើមិនទាន់ចូល ហើយចុច Home, គឺនៅតែបង្ហាញ Login
      showSection("login-form-section"); 
      return;
    }

    if (target === "home") {
      showSection("home");
      // ⚠️ NEW HOME LOGIC
      if (currentRole === 'admin') {
        document.getElementById("home-title").textContent = "Admin Pending Review Summary";
        document.getElementById("staff-pending-reimbursement").style.display = 'none';
        document.getElementById("staff-pending-payment").style.display = 'none';
        document.getElementById("admin-pending-review").style.display = 'block';
        loadPendingRequestsSummary(); // Reload admin notification
      } else {
        document.getElementById("home-title").textContent = "Your Pending Requests";
        document.getElementById("staff-pending-reimbursement").style.display = 'block';
        document.getElementById("staff-pending-payment").style.display = 'block';
        document.getElementById("admin-pending-review").style.display = 'none';
        loadStaffPendingRequests(); // Load staff pending tables
      }
    } else if (target === "reimbursement") {
      showSection("reimbursement");
      document.getElementById("reimbursementForm").style.display = token && currentRole === 'staff' ? "block" : "none";
      if (token && currentRole === 'staff') loadMyRequests();
    } else if (target === "payment") {
      showSection("payment");
      document.getElementById("paymentForm").style.display = token && currentRole === 'staff' ? "block" : "none";
      if (token && currentRole === 'staff') loadMyPaymentRequests();
    } else if (target === "admin") {
      if (currentRole !== "admin") return;
      showSection("admin"); 
      loadAdminUsers();
    } 
    // "Review Requests" button
    else if (target === "admin-review-main") {
      if (currentRole !== "admin") return;
      showSection("admin-review-main"); 
      // ⚠️ កំណត់លាក់តារាងទាំងពីរនៅពេលចូល Section ដំបូង
      document.getElementById('admin-reimbursement-panel').style.display = 'none';
      document.getElementById('admin-payment-panel').style.display = 'none';
    }
    else if (target === "history") {
      showSection("history");
      loadHistoryRequests(); 
      // ⚠️ កំណត់លាក់តារាងទាំងពីរនៅពេលចូល Section ដំបូង
      document.getElementById('history-reimbursement').style.display = 'none';
      document.getElementById('history-payment').style.display = 'none';
    } else if (target === "record") {
      if (currentRole !== "admin") return;
      showSection("record");
      loadRecordRequests(); 
      // ⚠️ កំណត់លាក់តារាងទាំងពីរនៅពេលចូល Section ដំបូង
      document.getElementById('record-reimbursement').style.display = 'none';
      document.getElementById('record-payment').style.display = 'none';
    }
  });
});

// Admin Review Table Switchers (MODIFIED)
function showAdminReviewTable(type) {
    // 1. លាក់ផ្ទាំងទាំងពីរជាមុនសិន
    document.getElementById('admin-reimbursement-panel').style.display = 'none';
    document.getElementById('admin-payment-panel').style.display = 'none';
    
    // 2. បង្ហាញផ្ទាំងដែលត្រូវគ្នា និង Load Data
    const targetElement = document.getElementById(`admin-${type}-panel`);
    if (targetElement) {
        targetElement.style.display = 'block';
        loadAdminRequests(type);
    }
}

// History and Record Table Switchers (MODIFIED)
function showHistoryTable(type) {
  // 1. លាក់តារាងទាំងពីរជាមុនសិន
  document.getElementById('history-reimbursement').style.display = 'none';
  document.getElementById('history-payment').style.display = 'none';
  
  // 2. បង្ហាញតារាងដែលត្រូវគ្នា
  document.getElementById(`history-${type}`).style.display = 'block';
}
function showRecordTable(type) {
  // 1. លាក់តារាងទាំងពីរជាមុនសិន
  document.getElementById('record-reimbursement').style.display = 'none';
  document.getElementById('record-payment').style.display = 'none';

  // 2. បង្ហាញតារាងដែលត្រូវគ្នា
  document.getElementById(`record-${type}`).style.display = 'block';
}


// ---------- Login / Logout ----------
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const adminMenuBtn = document.getElementById("adminMenuBtn");
const adminReviewBtn = document.getElementById("adminReviewBtn");
const reimbursementBtn = document.getElementById("reimbursementBtn");
const paymentBtn = document.getElementById("paymentBtn");
const historyMenuBtn = document.getElementById("historyMenuBtn");
const recordMenuBtn = document.getElementById("recordMenuBtn");
const adminNotification = document.getElementById("adminNotification");


loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMessage.textContent = "";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const form = new FormData();
  form.append("username", username);
  form.append("password", password);

  try {
    const res = await fetch("/token", { method: "POST", body: form });
    if (!res.ok) {
      loginMessage.textContent = "Login failed. Please check username/password.";
      return;
    }
    const data = await res.json();
    token = data.access_token;
    const payload = JSON.parse(atob(token.split(".")[1]));
    currentRole = payload.role;

    document.getElementById("login-form-section").classList.add("is-hidden"); // Hide login
    logoutBtn.style.display = "inline-block";
    historyMenuBtn.style.display = "inline-block";

    // ⚠️ NEW HOME LOGIC: Both roles go to Home/Pending screen
    showSection("home");

    if (currentRole === "admin") {
      adminMenuBtn.style.display = "inline-block";
      recordMenuBtn.style.display = "inline-block"; 
      adminReviewBtn.style.display = "inline-block"; 
      reimbursementBtn.style.display = "none";
      paymentBtn.style.display = "none";
      
      // Admin home screen
      document.getElementById("home-title").textContent = "Admin Pending Review Summary";
      document.getElementById("staff-pending-reimbursement").style.display = 'none';
      document.getElementById("staff-pending-payment").style.display = 'none';
      document.getElementById("admin-pending-review").style.display = 'block';
      loadPendingRequestsSummary();
    } else {
      adminMenuBtn.style.display = "none";
      recordMenuBtn.style.display = "none"; 
      adminReviewBtn.style.display = "none"; 
      reimbursementBtn.style.display = "inline-block";
      paymentBtn.style.display = "inline-block";
      
      // Staff home screen
      document.getElementById("home-title").textContent = "Your Pending Requests";
      document.getElementById("staff-pending-reimbursement").style.display = 'block';
      document.getElementById("staff-pending-payment").style.display = 'block';
      document.getElementById("admin-pending-review").style.display = 'none';
      loadStaffPendingRequests();
    }
  } catch {
    loginMessage.textContent = "Login failed. Please check username/password.";
  }
});

function logout() {
  token = null;
  currentRole = null;
  logoutBtn.style.display = "none";
  adminMenuBtn.style.display = "none";
  recordMenuBtn.style.display = "none"; 
  adminReviewBtn.style.display = "none"; 
  historyMenuBtn.style.display = "none"; 
  reimbursementBtn.style.display = "inline-block";
  paymentBtn.style.display = "inline-block";
  adminNotification.style.display = "none"; 
  // ⚠️ Show the login form section on logout
  showSection("login-form-section");
  document.getElementById("reimbursementForm").style.display = "none";
  document.getElementById("paymentForm").style.display = "none";
  document.querySelectorAll("tbody").forEach(el => el.innerHTML = "");
}
logoutBtn.addEventListener("click", logout);

// ---------- Staff submit forms (No changes) ----------
document.getElementById("reimbursementForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await fetch("/submit_reimbursement", { method: "POST", headers: authHeaders(), body: fd });
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error("Submit failed");
    await res.json();
    e.target.reset();
    await loadMyRequests();
    // Update home screen after submission
    if(document.getElementById("home").classList.contains("is-hidden") === false) {
      loadStaffPendingRequests();
    }
  } catch {
    alert("Failed to submit reimbursement.");
  }
});

document.getElementById("paymentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await fetch("/submit_payment", { method: "POST", headers: authHeaders(), body: fd });
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error("Submit failed");
    await res.json();
    e.target.reset();
    await loadMyPaymentRequests();
    // Update home screen after submission
    if(document.getElementById("home").classList.contains("is-hidden") === false) {
      loadStaffPendingRequests();
    }
  } catch {
    alert("Failed to submit payment request.");
  }
});

// ---------- Staff current month requests (Used for Reimbursement/Payment tabs) ----------
async function loadMyRequests() {
  const tbody = document.querySelector("#recordsTable tbody");
  tbody.innerHTML = "";
  try {
    const res = await fetch("/my_requests", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    const reimbursements = data.filter(r => r.type === "reimbursement");
    if (!reimbursements.length) {
      tbody.innerHTML = "<tr><td colspan='7'>No reimbursement requests yet</td></tr>";
      return;
    }
    reimbursements.forEach(r => {
      const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
      let statusDisplay = r.status === 'Paid' ? `<span class="status-paid">Paid (${formatDate(r.paid_date)})</span>` : r.status;
      if (r.status === 'Pending') statusDisplay = `<span class="status-pending">${r.status}</span>`;
      else if (r.status === 'Approved') statusDisplay = `<span class="status-approved">${r.status}</span>`;
      else if (r.status === 'Rejected') statusDisplay = `<span class="status-rejected">${r.status}</span>`;

      tbody.innerHTML += `
        <tr>
          <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${formatDate(r.date)}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${statusDisplay}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='7'>Failed to load requests</td></tr>";
  }
}

async function loadMyPaymentRequests() {
  const tbody = document.querySelector("#paymentsTable tbody");
  tbody.innerHTML = "";
  try {
    const res = await fetch("/my_requests", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    const payments = data.filter(r => r.type === "payment");
    if (!payments.length) {
      tbody.innerHTML = "<tr><td colspan='7'>No payment requests yet</td></tr>";
      return;
    }
    payments.forEach(r => {
      const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
      let statusDisplay = r.status === 'Paid' ? `<span class="status-paid">Paid (${formatDate(r.paid_date)})</span>` : r.status;
      if (r.status === 'Pending') statusDisplay = `<span class="status-pending">${r.status}</span>`;
      else if (r.status === 'Approved') statusDisplay = `<span class="status-approved">${r.status}</span>`;
      else if (r.status === 'Rejected') statusDisplay = `<span class="status-rejected">${r.status}</span>`;
      
      tbody.innerHTML += `
        <tr>
          <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${formatDate(r.date)}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${statusDisplay}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='7'>Failed to load payment requests</td></tr>";
  }
}

// ⚠️ NEW: Load Staff Pending Requests for the Home Screen
async function loadStaffPendingRequests() {
  if (currentRole !== 'staff') return;

  const rTbody = document.querySelector("#staffPendingReimbursementTable tbody");
  const pTbody = document.querySelector("#staffPendingPaymentTable tbody");
  rTbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  pTbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  try {
    const res = await fetch("/my_requests", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();

    const pendingReimbursements = data.filter(r => r.type === "reimbursement" && r.status === "Pending");
    const pendingPayments = data.filter(r => r.type === "payment" && r.status === "Pending");

    // Populate Reimbursement Table
    rTbody.innerHTML = "";
    if (!pendingReimbursements.length) {
      rTbody.innerHTML = "<tr><td colspan='6'>No pending reimbursement requests.</td></tr>";
    } else {
      pendingReimbursements.forEach(r => {
        const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
        rTbody.innerHTML += `
          <tr>
            <td>${r.type}</td>
            <td>${formatDate(r.date)}</td>
            <td>${r.description}</td>
            <td>${r.amount}</td>
            <td><span class="status-pending">${r.status}</span></td>
            <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
          </tr>`;
      });
    }

    // Populate Payment Table
    pTbody.innerHTML = "";
    if (!pendingPayments.length) {
      pTbody.innerHTML = "<tr><td colspan='6'>No pending payment requests.</td></tr>";
    } else {
      pendingPayments.forEach(r => {
        const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
        pTbody.innerHTML += `
          <tr>
            <td>${r.type}</td>
            <td>${formatDate(r.date)}</td>
            <td>${r.description}</td>
            <td>${r.amount}</td>
            <td><span class="status-pending">${r.status}</span></td>
            <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
          </tr>`;
      });
    }

  } catch (e) {
    console.error("Error loading staff pending requests:", e);
    rTbody.innerHTML = "<tr><td colspan='6'>Failed to load pending requests.</td></tr>";
    pTbody.innerHTML = "<tr><td colspan='6'>Failed to load pending requests.</td></tr>";
  }
}


// ---------- NEW: Admin Notification Function ----------
async function loadPendingRequestsSummary() {
    const summaryText = document.getElementById("notificationText");
    adminNotification.style.display = 'none';

    if (currentRole !== 'admin') return;

    try {
        const res = await fetch("/admin/pending_summary", { headers: authHeaders() });
        if (handleUnauthorized(res)) return;
        
        const data = await res.json();
        const totalPending = data.reimbursement_pending + data.payment_pending;

        if (totalPending > 0) {
            summaryText.innerHTML = `
                <p>⚠️ **Attention Admin:** There are **${totalPending}** pending requests awaiting review:</p>
                <ul>
                    <li>**${data.reimbursement_pending}** Reimbursement Requests</li>
                    <li>**${data.payment_pending}** Payment Requests</li>
                </ul>
                <p>Click **Review Requests** in the menu to take action.</p>
            `;
            adminNotification.style.display = 'block';
        }
    } catch (e) {
        console.error("Failed to load pending summary:", e);
    }
}


// ---------- Admin requests table (Review Requests) ----------
async function loadAdminRequests(type) {
  const tableId = type === 'reimbursement' ? "#adminReimbursementTable tbody" : "#adminPaymentTable tbody";
  const tbody = document.querySelector(tableId);
  tbody.innerHTML = '<tr><td colspan="9">Loading requests...</td></tr>';
  
  if (currentRole !== 'admin') {
      tbody.innerHTML = '<tr><td colspan="9">Access Denied.</td></tr>';
      return;
  }
  
  try {
    const res = await fetch(`/admin/requests?type=${type}`, { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    
    tbody.innerHTML = ""; 

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan='9'>No ${type} requests found for this month</td></tr>`;
      return;
    }
    
    data.forEach(r => {
      const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
      let actionButtons = '';
      let statusDisplay = r.status;
      
      if (r.status === 'Pending') {
        actionButtons = `
          <button type="button" class="approve-btn" onclick="updateStatus('${r._id}','Approved', '${type}')">Approve</button>
          <button type="button" class="reject-btn" onclick="updateStatus('${r._id}','Rejected', '${type}')">Reject</button>
        `;
        statusDisplay = `<span class="status-pending">${r.status}</span>`;
      } else if (r.status === 'Approved') {
        actionButtons = `
          <button type="button" class="btn-solid" onclick="updateStatus('${r._id}','Paid', '${type}')">Mark Paid</button>
        `;
        statusDisplay = `<span class="status-approved">${r.status}</span>`;
      } else if (r.status === 'Paid') {
        statusDisplay = `<span class="status-paid">Paid (${formatDate(r.paid_date)})</span>`; 
        actionButtons = 'Complete';
      } else if (r.status === 'Rejected') {
        statusDisplay = `<span class="status-rejected">Rejected</span>`;
        actionButtons = 'Cancelled';
      } else {
        actionButtons = r.status;
      }
      
      tbody.innerHTML += `
        <tr>
          <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${formatDate(r.date)}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${statusDisplay}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
          <td>${actionButtons}</td>
        </tr>`;
    });
    
  } catch {
    tbody.innerHTML = `<tr><td colspan='9'>Failed to load admin ${type} requests</td></tr>`;
  }
}

// ---------- Admin update status (FIXED LOGIC) ----------
async function updateStatus(id, status, type) {
    // 🟢 FIX: គ្រាន់តែផ្ញើ status តែប៉ុណ្ណោះ។ Backend (Python) នឹងកំណត់ paid_date ខ្លួនឯង។
    let bodyData = { status: status }; 

    try {
        const res = await fetch(`/admin/requests/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            // ប្រើ bodyData ដែលមានតែ status
            body: JSON.stringify(bodyData) 
        });
        if (handleUnauthorized(res)) return;
        
        if (!res.ok) {
            const errorDetails = await res.json().catch(() => ({}));
            console.error("Server Error Details:", errorDetails);
            const message = errorDetails.detail || `Server responded with status ${res.status}.`;
            throw new Error(message); 
        }
        
        await loadAdminRequests(type); 
        loadPendingRequestsSummary(); 
        
        if (currentRole === 'staff' && document.getElementById("home").classList.contains("is-hidden") === false) {
            loadStaffPendingRequests();
        }

    } catch (e) {
        alert(`Failed to update status. Details: ${e.message || "Check console for server response."}`); 
    }
}


// ---------- Admin create user / loadAdminUsers / deleteUser (User Management) (No changes) ----------
const addUserForm = document.getElementById("addUserForm");
const createUserMessage = document.getElementById("createUserMessage");

addUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createUserMessage.textContent = "";
  const fd = new FormData(addUserForm);
  try {
    const res = await fetch("/create_user", {
      method: "POST",
      headers: authHeaders(),
      body: fd
    });
    const data = await res.json();
    if (handleUnauthorized(res)) return;
    if (res.ok) {
      createUserMessage.textContent = "User created.";
      addUserForm.reset();
      await loadAdminUsers(); 
    } else {
      createUserMessage.textContent = data.detail || "Failed to create user.";
    }
  } catch {
    createUserMessage.textContent = "Error creating user.";
  }
});

async function loadAdminUsers() {
  const tbody = document.querySelector("#usersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  try {
    const res = await fetch("/admin/users", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = "<tr><td colspan='4'>No users found</td></tr>";
      return;
    }
    data.forEach(u => {
      tbody.innerHTML += `
        <tr>
          <td>${u.username}</td>
          <td>${u.role}</td>
          <td>${u.created_at || ""}</td>
          <td>
            <button type="button" class="delete-btn" onclick="deleteUser('${u.username}')">Delete</button>
          </td>
          
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='4'>Failed to load users</td></tr>";
  }
}

async function deleteUser(username) {
  if (!confirm(`Delete user '${username}'?`)) return;
  try {
    const res = await fetch(`/admin/users/${username}`, {
      method: "DELETE",
      headers: authHeaders()
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      alert(msg.detail || "Failed to delete user.");
      return;
    }
    await loadAdminUsers();
  } catch {
    alert("Failed to delete user.");
  }
}


// ---------- History & Record Functions (No changes in loading logic, just in display) ----------
async function loadHistoryRequests() {
  const rTbody = document.querySelector("#historyReimbursementTable tbody");
  const pTbody = document.querySelector("#historyPaymentTable tbody");
  rTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  pTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

  try {
    const res = await fetch("/history_requests", { headers: authHeaders() }); 
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    
    const reimbursements = data.filter(r => r.type === "reimbursement");
    const payments = data.filter(r => r.type === "payment");

    populateHistoryTable(rTbody, reimbursements, 'reimbursement');
    populateHistoryTable(pTbody, payments, 'payment');

  } catch {
    rTbody.innerHTML = "<tr><td colspan='7'>Failed to load reimbursement history.</td></tr>";
    pTbody.innerHTML = "<tr><td colspan='7'>Failed to load payment history.</td></tr>";
  }
}

function populateHistoryTable(tbody, data, type) {
  tbody.innerHTML = "";
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan='7'>No ${type} history found.</td></tr>`;
    return;
  }

  data.forEach(r => {
    const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
    let statusDisplay = r.status === 'Paid' 
      ? `<span class="status-paid">Paid (${formatDate(r.paid_date)})</span>` 
      : `<span class="status-rejected">Rejected</span>`;
    
    tbody.innerHTML += `
      <tr>
        <td>${r.type}</td>
        <td>${r.staffName}</td>
        <td>${formatDate(r.date)}</td>
        <td>${r.description || r.purpose}</td>
        <td>${r.amount}</td>
        <td>${statusDisplay}</td>
        <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
      </tr>`;
  });
}

async function loadRecordRequests() {
  const rTbody = document.querySelector("#recordReimbursementTable tbody");
  const pTbody = document.querySelector("#recordPaymentTable tbody");
  rTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  pTbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  
  if (currentRole !== 'admin') {
    rTbody.innerHTML = '<tr><td colspan="7">Access Denied.</td></tr>';
    pTbody.innerHTML = '<tr><td colspan="7">Access Denied.</td></tr>';
    return;
  }

  try {
    const res = await fetch("/admin/record", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    
    const reimbursements = data.filter(r => r.type === "reimbursement");
    const payments = data.filter(r => r.type === "payment");

    populateRecordTable(rTbody, reimbursements, 'reimbursement');
    populateRecordTable(pTbody, payments, 'payment');

  } catch {
    rTbody.innerHTML = "<tr><td colspan='7'>Failed to load reimbursement records.</td></tr>";
    pTbody.innerHTML = "<tr><td colspan='7'>Failed to load payment records.</td></tr>";
  }
}

function populateRecordTable(tbody, data, type) {
  tbody.innerHTML = "";
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan='7'>No paid ${type} records found.</td></tr>`;
    return;
  }

  data.forEach(r => {
    const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
    
    tbody.innerHTML += `
      <tr>
        <td>${r.type}</td>
        <td>${r.staffName}</td>
        <td>${formatDate(r.date)}</td>
        <td>${r.description || r.purpose}</td>
        <td>${r.amount}</td>
        <td><span class="status-paid">${formatDate(r.paid_date)}</span></td>
        <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
      </tr>`;
  });
}