const form = document.getElementById("userForm");
const userList = document.getElementById("userList");
let users = [];

async function adminRequest(action, data = {}) {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
    });
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch { throw new Error("The API returned an invalid response."); }
    if (!response.ok) throw new Error(result.error || "The request failed.");
    return result;
}

function readPermissions() {
    return {
        canManageUsers: document.getElementById("canManageUsers").checked,
        canManageInventory: document.getElementById("canManageInventory").checked,
        canManageStock: document.getElementById("canManageStock").checked,
        canViewReports: document.getElementById("canViewReports").checked
    };
}

function renderUsers() {
    document.getElementById("userCount").innerText = `${users.length} account${users.length === 1 ? "" : "s"}`;
    userList.innerHTML = users.map(user => {
        const permissions = user.permissions;
        const labels = [];
        if (permissions.canManageUsers) labels.push("Users");
        if (permissions.canManageInventory) labels.push("Inventory");
        if (permissions.canManageStock) labels.push("Stock");
        if (permissions.canViewReports) labels.push("Reports");
        return `<article class="user-card">
            <div class="user-card-heading"><div><h3>${user.displayName}</h3><p>@${user.username} · ${user.role}</p></div><span class="access-badge">${user.role === "Administrator" ? "Full access" : `${labels.length} privileges`}</span></div>
            <div class="privilege-list">${labels.length ? labels.map(label => `<span>${label}</span>`).join("") : "<span class=\"muted\">No privileges assigned</span>"}</div>
            <div class="user-actions"><button class="btn-edit" type="button" data-edit="${user.id}">Edit</button><button class="btn-delete" type="button" data-delete="${user.id}">Delete</button></div>
        </article>`;
    }).join("");
}

function resetForm() {
    form.reset();
    document.getElementById("userId").value = "";
    document.getElementById("role").value = "Inventory Officer";
    document.getElementById("formTitle").innerText = "Create user";
    document.getElementById("submitLabel").innerText = "Create account";
    document.getElementById("cancelEdit").classList.add("hidden");
    document.getElementById("username").disabled = false;
    document.getElementById("passwordHint").innerText = "(at least 6 characters)";
    document.getElementById("formMessage").innerText = "";
}

function editUser(id) {
    const user = users.find(record => record.id === id);
    if (!user) return;
    document.getElementById("userId").value = user.id;
    document.getElementById("username").value = user.username;
    document.getElementById("username").disabled = true;
    document.getElementById("displayName").value = user.displayName;
    document.getElementById("role").value = user.role;
    document.getElementById("password").value = "";
    document.getElementById("passwordHint").innerText = "(leave blank to keep current password)";
    Object.entries(user.permissions).forEach(([key, value]) => { document.getElementById(key).checked = value; });
    document.getElementById("formTitle").innerText = "Edit user";
    document.getElementById("submitLabel").innerText = "Save changes";
    document.getElementById("cancelEdit").classList.remove("hidden");
    document.getElementById("formMessage").innerText = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = Number(document.getElementById("userId").value);
    const data = { id, username: document.getElementById("username").value.trim(), displayName: document.getElementById("displayName").value.trim(), role: document.getElementById("role").value.trim(), password: document.getElementById("password").value, ...readPermissions() };
    try {
        await adminRequest(id ? "update-user" : "create-user", data);
        await loadUsers(); resetForm();
        document.getElementById("formMessage").innerText = id ? "User account updated." : "User account created.";
    } catch (error) { document.getElementById("formMessage").innerText = error.message; }
});

document.getElementById("cancelEdit").addEventListener("click", resetForm);
userList.addEventListener("click", async event => {
    const editId = Number(event.target.dataset.edit); const deleteId = Number(event.target.dataset.delete);
    if (editId) editUser(editId);
    if (deleteId && confirm("Delete this user account?")) {
        try { await adminRequest("delete-user", { id: deleteId }); await loadUsers(); } catch (error) { alert(error.message); }
    }
});

async function loadUsers() {
    try { users = (await adminRequest("users")).users; renderUsers(); }
    catch (error) { document.getElementById("formMessage").innerText = error.message; }
}
loadUsers();
