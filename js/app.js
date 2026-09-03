const defaultInventory = [
    { item: "A4 SHEET", bf: 0, stock: 0, status: "Low", updated: "06/10/2026" },
    { item: "ARCHIVE BOXES", bf: 13, stock: 13, status: "Medium", updated: "15/06/2026" },
    { item: "CEDI DEPOSIT", bf: 463, stock: 463, status: "Available", updated: "15/06/2026" },
    { item: "NOTE PADS", bf: 5, stock: 5, status: "Low", updated: "08/06/2026" }
];

const defaultTransactions = [
    { date: "15-Jun-2026", month: "2026-06", item: "ARCHIVE BOXES", action: "Supplied", quantity: 2, oldStock: 15, newStock: 13, user: "MZ513332" },
    { date: "15-Jun-2026", month: "2026-06", item: "CEDI DEPOSIT", action: "Supplied", quantity: 20, oldStock: 483, newStock: 463, user: "MZ513332" },
    { date: "08-Jun-2026", month: "2026-06", item: "NOTE PADS", action: "Received", quantity: 3, oldStock: 2, newStock: 5, user: "MZ513332" }
];

let inventoryCache = [];
let transactionsCache = [];

async function logout(message = "") {
    try { await fetch("api/index.php?action=logout", { method: "POST" }); } catch { /* Session may already be gone. */ }
    sessionStorage.removeItem("ims_tab_id");
    if (message) alert(message);
    window.location.href = "index.html";
}

async function confirmTab() {
    const tabId = sessionStorage.getItem("ims_tab_id");
    if (!tabId) return;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("ims-active-tab");
    let duplicate = false;
    if (channel) {
        channel.onmessage = event => {
            if (event.data === tabId) duplicate = true;
            else if (event.data === "probe") channel.postMessage(tabId);
        };
        channel.postMessage("probe");
        await new Promise(resolve => setTimeout(resolve, 250));
        channel.close();
    }
    if (duplicate) {
        sessionStorage.removeItem("ims_tab_id");
        alert("This tab was duplicated. You have been logged out of the duplicate tab.");
        window.location.href = "index.html";
        return;
    }
    const response = await apiRequest("claim-tab", { tabId });
    return response;
}

async function apiRequest(action, data = {}) {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const responseText = await response.text();
    let result = {};
    try {
        result = responseText ? JSON.parse(responseText) : {};
    } catch {
        throw new Error("The PHP API did not return JSON. Open http://localhost/IMS/index.html with Apache running in XAMPP.");
    }
    if (!responseText) {
        throw new Error("The PHP API returned an empty response. Open http://localhost/IMS/index.html with Apache running in XAMPP.");
    }
    if (!response.ok) throw new Error(result.error || "The server request failed.");
    return result;
}

function getInventory() {
    return inventoryCache;
}

function getTransactions() {
    return transactionsCache;
}

async function refreshData() {
    await confirmTab();
    const page = window.location.pathname.split("/").pop().toLowerCase();
    const result = await apiRequest("bootstrap", { page });
    inventoryCache = result.inventory;
    transactionsCache = result.transactions;
    document.querySelectorAll(".admin-only-nav").forEach(element => {
        element.hidden = result.currentUser?.role !== "Administrator";
    });
    const permissions = result.currentUser?.permissions || {};
    document.querySelectorAll("[data-user-name]").forEach(element => {
        element.innerText = result.currentUser?.displayName || result.currentUser?.username || "User";
    });
    document.querySelectorAll("[data-user-role]").forEach(element => {
        element.innerText = result.currentUser?.role || "User";
    });
    document.querySelectorAll("[data-welcome-name]").forEach(element => {
        element.innerText = result.currentUser?.displayName || result.currentUser?.username || "your account";
    });
    document.querySelectorAll("[data-required-permission]").forEach(element => {
        element.hidden = permissions[element.dataset.requiredPermission] !== true;
    });
    document.body.classList.add("access-ready");
    const permissionStorageKey = `ims_permissions_${result.currentUser?.username || "user"}`;
    const previousPermissions = JSON.parse(localStorage.getItem(permissionStorageKey) || "null");
    const added = previousPermissions && Object.keys(permissions).filter(key => permissions[key] && !previousPermissions[key]);
    if (added?.length) alert("A new privilege has been added to your account. Your access has been updated.");
    localStorage.setItem(permissionStorageKey, JSON.stringify(permissions));
    const requiredPagePermission = { "inventory.html": "canManageInventory", "stock-entry.html": "canManageStock", "report.html": "canViewReports" }[page];
    if (requiredPagePermission && permissions[requiredPagePermission] !== true && result.currentUser?.role !== "Administrator") {
        alert("You do not have permission to access this section.");
        window.location.href = "dashboard.html";
        return;
    }
    renderInventory();
    renderHistory();
    renderReport();
    renderDashboard();
    renderStockEntryItems();
}

function formatTransactionDate(date) {
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).replace(/ /g, "-");
}

function inventoryStatus(stock) {
    if (stock <= 5) return "Low";
    if (stock <= 20) return "Medium";
    return "Available";
}

function statusClass(status) {
    return status === "Available" ? "high" : status === "Medium" ? "medium" : "low";
}

function renderInventory() {
    const table = document.getElementById("inventoryTable");
    if (!table) return;

    const search = (document.querySelector(".search-box")?.value || "").toLowerCase();
    const inventory = getInventory()
        .filter(record => record.item.toLowerCase().includes(search));

    table.innerHTML = inventory.map(record => `
        <tr>
            <td>${record.item}</td>
            <td>${record.bf}</td>
            <td>${record.stock}</td>
            <td>${record.updated}</td>
            <td><span class="status ${statusClass(record.status)}">${record.status}</span></td>
            <td>
                <button class="btn-view" onclick="viewItem(${record.id})">View</button>
                <button class="btn-edit" onclick="editItem(${record.id})">Edit</button>
                <button class="btn-delete" onclick="deleteItem(${record.id})">Delete</button>
            </td>
        </tr>
    `).join("");
}

function openAddItemModal() {
    document.getElementById("addItemModal").style.display = "flex";
}

function closeAddItemModal() {
    document.getElementById("addItemModal").style.display = "none";
}

async function saveNewItem() {
    const item = document.getElementById("newItemName").value.trim().toUpperCase();
    const bf = Number(document.getElementById("newBF").value) || 0;
    const stock = Number(document.getElementById("newStock").value) || 0;
    const status = document.getElementById("newStatus").value;

    if (!item) return alert("Please enter an item name.");
    try {
        await apiRequest("add-item", { item, bf, stock, status });
        closeAddItemModal();
        await refreshData();
    } catch (error) { alert(error.message); }
}

function viewItem(index) {
    const record = getInventory().find(item => item.id === index);
    if (!record) return;
    document.getElementById("modalItem").innerText = record.item;
    document.getElementById("modalBF").innerText = record.bf;
    document.getElementById("modalStock").innerText = record.stock;
    document.getElementById("modalDate").innerText = record.updated;
    document.getElementById("modalStatus").innerText = record.status;
    document.getElementById("viewModal").style.display = "flex";
}

function closeViewModal() {
    document.getElementById("viewModal").style.display = "none";
}

async function deleteItem(index) {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
        await apiRequest("delete-item", { id: index });
        await refreshData();
    } catch (error) { alert(error.message); }
}

let editingItemIndex = null;

function editItem(index) {
    const record = getInventory().find(item => item.id === index);
    if (!record) return;

    editingItemIndex = index;
    document.getElementById("editItemName").value = record.item;
    document.getElementById("editStock").value = record.stock;
    document.getElementById("editItemModal").style.display = "flex";
}

function closeEditItemModal() {
    document.getElementById("editItemModal").style.display = "none";
    editingItemIndex = null;
}

async function saveEditItem() {
    if (editingItemIndex === null) return;

    const inventory = getInventory();
    const record = inventory.find(item => item.id === editingItemIndex);
    if (!record) return;
    const updatedItem = document.getElementById("editItemName").value.trim().toUpperCase();
    const stock = Number(document.getElementById("editStock").value);

    if (!updatedItem) {
        alert("Item name cannot be empty.");
        return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
        alert("Stock must be a non-negative whole number.");
        return;
    }

    try {
        await apiRequest("update-item", { id: record.id, item: updatedItem, stock });
        closeEditItemModal();
        await refreshData();
    } catch (error) { alert(error.message); }
}

function renderStockEntryItems() {
    const options = document.getElementById("inventoryItemOptions");
    if (!options) return;

    options.innerHTML = getInventory().map(record =>
        `<option value="${record.item}">${record.item}</option>`
    ).join("");
    updateStockSummary();
}

function updateStockSummary() {
    const item = document.getElementById("stockItem")?.value.trim().toUpperCase();
    const stock = document.getElementById("stockQuantity");
    const record = getInventory().find(itemRecord => itemRecord.item === item);
    if (!record) {
        document.getElementById("currentStock").innerText = item ? "New item" : "0";
        document.getElementById("newStock").innerText = Number(stock?.value) || 0;
        return;
    }

    const quantity = Number(stock?.value) || 0;
    const action = document.getElementById("stockAction")?.value;
    const newStock = action === "Supplied" ? record.stock - quantity : record.stock + quantity;
    document.getElementById("currentStock").innerText = record.stock;
    document.getElementById("newStock").innerText = Math.max(newStock, 0);
}

async function saveStockEntry() {
    const item = document.getElementById("stockItem").value.trim().toUpperCase();
    const action = document.getElementById("stockAction").value;
    const quantity = Number(document.getElementById("stockQuantity").value);
    const notes = document.getElementById("stockNotes").value.trim();

    if (!item || !Number.isInteger(quantity) || quantity <= 0) {
        alert("Enter an item and a positive whole-number quantity.");
        return;
    }

    try {
        await apiRequest("stock-entry", { item, action, quantity, notes });
        await refreshData();
        document.getElementById("stockItem").value = "";
        document.getElementById("stockQuantity").value = "";
        document.getElementById("stockNotes").value = "";
        updateStockSummary();
        document.getElementById("successMessage").style.display = "block";
        setTimeout(() => document.getElementById("successMessage").style.display = "none", 3000);
    } catch (error) { alert(error.message); }
}

let pendingImports = [];
let lastImportSnapshot = null;

function importHeader(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function importNumber(value) {
    const number = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseInventoryRows(matrix) {
    const headerIndex = matrix.findIndex(row => {
        const headers = row.map(importHeader);
        return headers.some(header => ["item", "itemname", "product"].includes(header)) &&
            headers.some(header => ["stock", "currentstock", "balance", "quantity", "qty"].includes(header));
    });
    if (headerIndex < 0) return [];

    const headers = matrix[headerIndex].map(importHeader);
    const itemIndex = headers.findIndex(header => ["item", "itemname", "product"].includes(header));
    const stockIndex = headers.findIndex(header => ["stock", "currentstock", "balance", "quantity", "qty"].includes(header));
    const bfIndex = headers.findIndex(header => ["bf", "broughtforward", "openingstock"].includes(header));

    return matrix.slice(headerIndex + 1).map(row => ({
        item: String(row[itemIndex] || "").trim().toUpperCase(),
        bf: importNumber(row[bfIndex]) ?? 0,
        stock: importNumber(row[stockIndex])
    })).filter(row => row.item && row.stock !== null && !/^(total|subtotal|grand total)$/i.test(row.item));
}

async function parseInventoryFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (["xlsx", "xls"].includes(extension)) {
        if (!window.XLSX) throw new Error("Excel support is unavailable. Check your internet connection.");
        const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return parseInventoryRows(window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }));
    }
    throw new Error("Choose an Excel file (.xlsx or .xls).");
}

function renderImportPreview() {
    const table = document.getElementById("importPreview");
    const button = document.getElementById("importInventory");
    if (!table || !button) return;
    table.innerHTML = pendingImports.map((row, index) => `
        <tr><td><input type="checkbox" data-import-index="${index}" checked></td><td>${row.item}</td><td>${row.stock}</td></tr>
    `).join("");
    button.disabled = pendingImports.length === 0;
}

function showImportUndo(message, type = "success") {
    setImportStatus(message, type);
    const undoButton = document.getElementById("undoImport");
    if (undoButton) undoButton.hidden = !lastImportSnapshot;
}

async function undoLastImport() {
    if (!lastImportSnapshot || !confirm("Undo this import and restore the previous inventory list?")) return;
    try {
        await apiRequest("undo-import", { snapshot: lastImportSnapshot });
        lastImportSnapshot = null;
        await refreshData();
        showImportUndo("The imported items were removed and the previous list was restored.");
    } catch (error) { setImportStatus(`Undo failed: ${error.message}`, "error"); }
}

function setImportStatus(message, type = "") {
    const status = document.getElementById("importStatus");
    if (!status) return;
    status.className = `import-status ${type}`.trim();
    status.innerText = message;
}

async function previewInventoryFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    setImportStatus(`Reading ${file.name}...`);
    try {
        pendingImports = await parseInventoryFile(file);
        renderImportPreview();
        const message = pendingImports.length
            ? `${file.name}: ${pendingImports.length} inventory row(s) extracted and ready for review.`
            : `${file.name}: file was read, but no valid inventory data was extracted.`;
        setImportStatus(message, pendingImports.length ? "success" : "error");
        alert(pendingImports.length ? "Inventory file read successfully." : "File read, but no inventory data was found.");
    } catch (error) {
        pendingImports = [];
        renderImportPreview();
        setImportStatus(`The file could not be read: ${error.message}`, "error");
        alert(`File could not be read: ${error.message}`);
    }
}

async function importSelectedInventory() {
    const selected = [...document.querySelectorAll("[data-import-index]:checked")]
        .map(input => pendingImports[Number(input.dataset.importIndex)]);
    if (!selected.length) return alert("Select at least one inventory row.");
    if (!confirm(`${selected.length} item(s) will be added or updated in your inventory list. Continue?`)) return;
    lastImportSnapshot = selected.map(row => {
        const existing = getInventory().find(record => record.item === row.item);
        const updatedParts = existing?.updated?.split("/");
        const updated = updatedParts?.length === 3 ? `${updatedParts[2]}-${updatedParts[1]}-${updatedParts[0]}` : null;
        return existing ? { id: existing.id, item: existing.item, bf: existing.bf, stock: existing.stock, updated } : { item: row.item };
    });
    try {
        await apiRequest("import-items", { items: selected });
        await refreshData();
        pendingImports = [];
        document.getElementById("inventoryFile").value = "";
        renderImportPreview();
        showImportUndo(`${selected.length} inventory row(s) imported successfully. The inventory list has been updated.`);
    } catch (error) { alert(error.message); }
}

function renderHistory() {
    const table = document.getElementById("historyTable");
    if (!table) return;

    const search = (document.getElementById("historySearch")?.value || "").toLowerCase();
    const monthSelect = document.getElementById("historyMonth");
    const selectedMonth = monthSelect?.value || "all";
    if (monthSelect) {
        const months = [...new Set(getTransactions().map(transaction => transaction.month).filter(Boolean))].sort().reverse();
        monthSelect.innerHTML = `<option value="all">All Months</option>${months.map(value => {
            const [year, monthNumber] = value.split("-");
            const label = new Date(Number(year), Number(monthNumber) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            return `<option value="${value}">${label}</option>`;
        }).join("")}`;
        monthSelect.value = months.includes(selectedMonth) ? selectedMonth : "all";
    }
    const month = monthSelect?.value || "all";
    const transactions = getTransactions().filter(transaction => {
        const matchesSearch = [transaction.item, transaction.action, transaction.user]
            .some(value => value.toLowerCase().includes(search));
        return matchesSearch && (month === "all" || transaction.month === month);
    });

    table.innerHTML = transactions.map(transaction => `
        <tr>
            <td>${transaction.date}</td>
            <td>${transaction.item}</td>
            <td>${transaction.action}</td>
            <td>${transaction.quantity}</td>
            <td>${transaction.oldStock}</td>
            <td>${transaction.newStock}</td>
            <td>${transaction.user}</td>
        </tr>
    `).join("");

    const allTransactions = getTransactions();
    document.getElementById("totalTransactions").innerText = allTransactions.length;
    document.getElementById("itemsReceived").innerText = allTransactions
        .filter(transaction => transaction.action === "Received").length;
    document.getElementById("itemsSupplied").innerText = allTransactions
        .filter(transaction => transaction.action === "Supplied").length;
}

function renderReport() {
    const table = document.getElementById("reportTable");
    if (!table) return;

    const month = document.getElementById("reportMonth")?.value || "all";
    const transactions = getTransactions().filter(transaction =>
        month === "all" || transaction.month === month
    );
    table.innerHTML = getInventory().map(record => {
        const itemTransactions = transactions.filter(transaction => transaction.item === record.item);
        const received = itemTransactions
            .filter(transaction => transaction.action === "Received")
            .reduce((total, transaction) => total + transaction.quantity, 0);
        const supplied = itemTransactions
            .filter(transaction => transaction.action === "Supplied")
            .reduce((total, transaction) => total + transaction.quantity, 0);

        return `
            <tr>
                <td>${record.item}</td>
                <td>${record.bf}</td>
                <td>${received}</td>
                <td>${supplied}</td>
                <td>${record.stock}</td>
            </tr>
        `;
    }).join("");
}

function exportReport() {
    const month = document.getElementById("reportMonth")?.value || "all";
    const transactions = getTransactions().filter(transaction =>
        month === "all" || transaction.month === month
    );
    const rows = getInventory().map(record => {
        const itemTransactions = transactions.filter(transaction => transaction.item === record.item);
        return [
            record.item,
            record.bf,
            itemTransactions.filter(transaction => transaction.action === "Received")
                .reduce((total, transaction) => total + transaction.quantity, 0),
            itemTransactions.filter(transaction => transaction.action === "Supplied")
                .reduce((total, transaction) => total + transaction.quantity, 0),
            record.stock
        ];
    });
    const csv = [["ITEM", "B/F", "RECEIVED", "SUPPLIED", "STOCK"], ...rows]
        .map(row => row.join(","))
        .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `inventory-report-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function printReport() {
    window.print();
}

function renderDashboard() {
    const totalItemsElement = document.getElementById("totalItems");
    if (!totalItemsElement) return;

    const inventory = getInventory();
    const transactions = getTransactions();
    const stockTotal = inventory.reduce((total, record) => total + Number(record.stock || 0), 0);
    const lowStock = inventory.filter(record => record.status === "Low").length;
    const available = inventory.filter(record => record.status === "Available").length;
    const medium = inventory.filter(record => record.status === "Medium").length;

    totalItemsElement.innerText = inventory.length;
    document.getElementById("currentStockTotal").innerText = stockTotal.toLocaleString();
    document.getElementById("transactionTotal").innerText = transactions.length;
    document.getElementById("lowStockTotal").innerText = lowStock;
    document.getElementById("availableItems").innerText = available;
    document.getElementById("mediumItems").innerText = medium;
    document.getElementById("lowStockItems").innerText = lowStock;

    const table = document.getElementById("recentTransactions");
    if (!table) return;
    table.innerHTML = transactions.slice(0, 3).map(transaction => `
        <tr>
            <td>${transaction.date}</td>
            <td>${transaction.item}</td>
            <td>${transaction.action}</td>
            <td>${transaction.quantity}</td>
        </tr>
    `).join("");
}

function exportHistory() {
    const rows = getTransactions();
    const header = ["Date", "Item", "Action", "Quantity", "Old Stock", "New Stock", "User"];
    const csv = [header, ...rows.map(transaction => [
        transaction.date, transaction.item, transaction.action, transaction.quantity,
        transaction.oldStock, transaction.newStock, transaction.user
    ])].map(row => row.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "transaction-history.csv";
    link.click();
    URL.revokeObjectURL(link.href);
}

document.addEventListener("DOMContentLoaded", () => {
    refreshData().catch(error => {
        if (error.message.includes("permission") || error.message.includes("Administrator")) {
            alert(error.message);
            window.location.href = "dashboard.html";
            return;
        }
        alert(error.message);
    });
    document.querySelectorAll('a[href="index.html"]').forEach(link => {
        link.addEventListener("click", event => { event.preventDefault(); logout(); });
    });
    document.querySelector(".search-box")?.addEventListener("input", renderInventory);
    document.getElementById("historySearch")?.addEventListener("input", renderHistory);
    document.getElementById("historyMonth")?.addEventListener("change", renderHistory);
    document.getElementById("exportHistory")?.addEventListener("click", exportHistory);
    document.getElementById("reportMonth")?.addEventListener("change", renderReport);
    document.getElementById("exportReport")?.addEventListener("click", exportReport);
    document.getElementById("printReport")?.addEventListener("click", printReport);
    document.getElementById("stockItem")?.addEventListener("input", updateStockSummary);
    document.getElementById("stockItem")?.addEventListener("change", updateStockSummary);
    document.getElementById("stockAction")?.addEventListener("change", updateStockSummary);
    document.getElementById("stockQuantity")?.addEventListener("input", updateStockSummary);
    document.getElementById("inventoryFile")?.addEventListener("change", previewInventoryFile);
    document.getElementById("importInventory")?.addEventListener("click", importSelectedInventory);
    document.getElementById("undoImport")?.addEventListener("click", undoLastImport);
    window.setInterval(() => refreshData().catch(() => {}), 30000);
});
