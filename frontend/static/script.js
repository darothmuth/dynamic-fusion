// ---------- Welcome animation ----------
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runWelcomeSequence() {
  const companyName = document.getElementById("companyName");
  const welcomeText = document.getElementById("welcomeText");
  const logoBig = document.getElementById("logoBig");
  const welcomeScreen = document.getElementById("welcome-screen");

  // Logo fly-in
  logoBig.classList.add("logo-fly");
  await delay(2000);

   // Fade out logo
   logoBig.classList.add("logo-hide");
   await delay(1000);
 

  // Typing effect
  companyName.textContent = "DYNAMIC FUSION CO., LTD";
  companyName.classList.add("typing");
  await delay(1000);

  welcomeText.textContent = "Staff Reimbursement & Payment Portal";
  welcomeText.classList.add("typing");
  await delay(1000);

  // Fade-out welcome screen
  
  welcomeScreen.classList.add("fade-out");
  setTimeout(() => welcomeScreen.classList.add("is-hidden"), 1000);
}
runWelcomeSequence();

// ---------- State ----------
let token = null;
let currentRole = null;

// ---------- Helpers ----------
function showSection(id) {
  ["home", "reimbursement", "payment", "admin"].forEach(sec => {
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

// ---------- Navbar ----------
document.querySelector(".overflow-btn").addEventListener("click", () => {
  const menu = document.querySelector(".overflow-menu");
  const open = !menu.classList.contains("is-open");
  toggleMenu(open);
});
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    toggleMenu(false);

    if (!token && (target === "reimbursement" || target === "payment" || target === "admin")) {
      showSection("home");
      return;
    }
    if (target === "home") {
      showSection("home");
    } else if (target === "reimbursement") {
      showSection("reimbursement");
      document.getElementById("reimbursementForm").style.display = token ? "block" : "none";
      if (token) loadMyRequests();
    } else if (target === "payment") {
      showSection("payment");
      document.getElementById("paymentForm").style.display = token ? "block" : "none";
      if (token) loadMyPaymentRequests();
    } else if (target === "admin") {
      if (currentRole !== "admin") return;
      showSection("admin");
      loadAdminRequests();
      loadAdminUsers();
    }
  });
});

// ---------- Login / Logout ----------
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const adminMenuBtn = document.getElementById("adminMenuBtn");
const reimbursementBtn = document.getElementById("reimbursementBtn");
const paymentBtn = document.getElementById("paymentBtn");

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

    document.getElementById("home").classList.add("is-hidden");
    logoutBtn.style.display = "inline-block";

    if (currentRole === "admin") {
      adminMenuBtn.style.display = "inline-block";
      reimbursementBtn.style.display = "none";
      paymentBtn.style.display = "none";
      showSection("admin");
      loadAdminRequests();
      loadAdminUsers();
    } else {
      reimbursementBtn.style.display = "inline-block";
      paymentBtn.style.display = "inline-block";
      showSection("reimbursement");
      document.getElementById("reimbursementForm").style.display = "block";
      loadMyRequests();
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
  reimbursementBtn.style.display = "inline-block";
  paymentBtn.style.display = "inline-block";
  showSection("home");
  document.getElementById("reimbursementForm").style.display = "none";
  document.getElementById("paymentForm").style.display = "none";
  document.querySelector("#recordsTable tbody").innerHTML = "";
  document.querySelector("#paymentsTable tbody").innerHTML = "";
  document.querySelector("#adminTable tbody").innerHTML = "";
  const usersTableBody = document.querySelector("#usersTable tbody");
  if (usersTableBody) usersTableBody.innerHTML = "";
}
logoutBtn.addEventListener("click", logout);

// ---------- Staff submit reimbursement ----------
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
  } catch {
    alert("Failed to submit reimbursement.");
  }
});

// ---------- Staff submit payment ----------
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
  } catch {
    alert("Failed to submit payment request.");
  }
});

// ---------- Staff reimbursement table ----------
async function loadMyRequests() {
  const tbody = document.querySelector("#recordsTable tbody");
  tbody.innerHTML = "";
  try {
    const res = await fetch("/my_requests", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = "<tr><td colspan='7'>No requests yet</td></tr>";
      return;
    }
    data.forEach(r => {
      const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
      tbody.innerHTML += `
        <tr>
          <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${r.date}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${r.status}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='7'>Failed to load requests</td></tr>";
  }
}

// ---------- Staff payment table ----------
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
      tbody.innerHTML += `
                 <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${r.date}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${r.status}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='7'>Failed to load payment requests</td></tr>";
  }
}

// ---------- Admin requests table ----------
async function loadAdminRequests() {
  const tbody = document.querySelector("#adminTable tbody");
  tbody.innerHTML = "";
  try {
    const res = await fetch("/admin/requests", { headers: authHeaders() });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = "<tr><td colspan='8'>No staff requests</td></tr>";
      return;
    }
    data.forEach(r => {
      const proofUrl = r.proof_filename ? `/static/uploads/${r.proof_filename}` : "";
      tbody.innerHTML += `
        <tr>
          <td>${r.type}</td>
          <td>${r.staffName}</td>
          <td>${r.date}</td>
          <td>${r.description}</td>
          <td>${r.amount}</td>
          <td>${r.status}</td>
          <td>${r.proof_filename ? `<a href="${proofUrl}" target="_blank">View</a>` : ""}</td>
          <td>
            <button type="button" onclick="updateStatus('${r._id}','Approved')">Approve</button>
            <button type="button" class="reject-btn" onclick="updateStatus('${r._id}','Rejected')">Reject</button>
          </td>
        </tr>`;
    });
  } catch {
    tbody.innerHTML = "<tr><td colspan='8'>Failed to load admin requests</td></tr>";
  }
}

// ---------- Admin update status ----------
async function updateStatus(id, status) {
  try {
    const res = await fetch(`/admin/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status })
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error("Update failed");
    await loadAdminRequests();
  } catch {
    alert("Failed to update status.");
  }
}

// ---------- Admin create user ----------
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
      await loadAdminUsers(); // refresh users list
    } else {
      createUserMessage.textContent = data.detail || "Failed to create user.";
    }
  } catch {
    createUserMessage.textContent = "Error creating user.";
  }
});

// ---------- Admin users table ----------
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