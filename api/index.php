<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/config.php';

function requestBody(): array { return json_decode(file_get_contents('php://input'), true) ?: []; }
function respond(array $data, int $status = 200): never { http_response_code($status); echo json_encode($data); exit; }
function inventoryStatus(int $stock): string { return $stock <= 5 ? 'Low' : ($stock <= 20 ? 'Medium' : 'Available'); }
function inventoryRow(array $row): array {
    return ['id' => (int)$row['id'], 'item' => $row['item'], 'bf' => (int)$row['bf'], 'stock' => (int)$row['stock'], 'status' => inventoryStatus((int)$row['stock']), 'updated' => date('d/m/Y', strtotime($row['updated_at']))];
}
function currentUser(PDO $pdo): array {
    $query = $pdo->prepare('SELECT u.id, u.username, u.display_name, u.role, COALESCE(p.can_manage_users, u.role = "Administrator") can_manage_users, COALESCE(p.can_manage_inventory, 1) can_manage_inventory, COALESCE(p.can_manage_stock, 1) can_manage_stock, COALESCE(p.can_view_reports, 1) can_view_reports FROM users u LEFT JOIN user_permissions p ON p.user_id = u.id WHERE u.id = ?');
    $query->execute([$_SESSION['user_id']]);
    $user = $query->fetch();
    if (!$user) respond(['error' => 'Your account is no longer available.'], 401);
    return $user;
}
function requirePermission(array $user, string $permission): void {
    if ($user['role'] !== 'Administrator' && !(int)$user[$permission]) respond(['error' => 'You do not have permission to perform this action.'], 403);
}
function requireAdministrator(array $user): void {
    if ($user['role'] !== 'Administrator') respond(['error' => 'Administrator access is required.'], 403);
}
function permissionData(array $body): array {
    return [
        'can_manage_users' => !empty($body['canManageUsers']) ? 1 : 0,
        'can_manage_inventory' => !empty($body['canManageInventory']) ? 1 : 0,
        'can_manage_stock' => !empty($body['canManageStock']) ? 1 : 0,
        'can_view_reports' => !empty($body['canViewReports']) ? 1 : 0
    ];
}

$action = $_GET['action'] ?? '';
$body = requestBody();

try {
    if ($action === 'login') {
        $query = $pdo->prepare('SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?');
        $query->execute([trim((string)($body['username'] ?? ''))]);
        $user = $query->fetch();
        if (!$user || !hash_equals($user['password_hash'], hash('sha256', (string)($body['password'] ?? '')))) respond(['error' => 'Invalid username or password.'], 401);
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['tab_id'] = trim((string)($body['tabId'] ?? ''));
        respond(['user' => ['username' => $user['username'], 'displayName' => $user['display_name'], 'role' => $user['role']]]);
    }
    if (!isset($_SESSION['user_id'])) respond(['error' => 'Please log in first.'], 401);
    $user = currentUser($pdo);

    if ($action === 'logout') {
        session_unset();
        session_destroy();
        respond(['message' => 'Logged out.']);
    }

    if ($action === 'claim-tab') {
        $tabId = trim((string)($body['tabId'] ?? ''));
        if ($tabId === '' || empty($_SESSION['tab_id']) || !hash_equals($_SESSION['tab_id'], $tabId)) {
            respond(['error' => 'This tab is no longer the active session.'], 409);
        }
        respond(['message' => 'Tab confirmed.']);
    }

    if ($action === 'users') {
        requireAdministrator($user);
        $rows = $pdo->query('SELECT u.id, u.username, u.display_name, u.role, COALESCE(p.can_manage_users, u.role = "Administrator") can_manage_users, COALESCE(p.can_manage_inventory, 1) can_manage_inventory, COALESCE(p.can_manage_stock, 1) can_manage_stock, COALESCE(p.can_view_reports, 1) can_view_reports FROM users u LEFT JOIN user_permissions p ON p.user_id = u.id ORDER BY u.display_name')->fetchAll();
        $users = array_map(static function (array $row): array {
            return ['id' => (int)$row['id'], 'username' => $row['username'], 'displayName' => $row['display_name'], 'role' => $row['role'], 'permissions' => ['canManageUsers' => (bool)$row['can_manage_users'], 'canManageInventory' => (bool)$row['can_manage_inventory'], 'canManageStock' => (bool)$row['can_manage_stock'], 'canViewReports' => (bool)$row['can_view_reports']]];
        }, $rows);
        respond(['users' => $users]);
    }
    if ($action === 'create-user') {
        requireAdministrator($user);
        $username = trim((string)($body['username'] ?? '')); $displayName = trim((string)($body['displayName'] ?? '')); $password = (string)($body['password'] ?? ''); $role = trim((string)($body['role'] ?? 'Inventory Officer'));
        if (!preg_match('/^[A-Za-z0-9._-]{3,80}$/', $username) || $displayName === '' || strlen($password) < 6 || $role === '') respond(['error' => 'Enter a valid username, display name, role, and password of at least 6 characters.'], 422);
        $pdo->beginTransaction();
        $query = $pdo->prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'); $query->execute([$username, hash('sha256', $password), $displayName, $role]);
        $permissions = permissionData($body); $query = $pdo->prepare('INSERT INTO user_permissions (user_id, can_manage_users, can_manage_inventory, can_manage_stock, can_view_reports) VALUES (?, ?, ?, ?, ?)'); $query->execute(array_merge([(int)$pdo->lastInsertId()], array_values($permissions)));
        $pdo->commit(); respond(['message' => 'User account created.']);
    }
    if ($action === 'update-user') {
        requireAdministrator($user);
        $id = (int)($body['id'] ?? 0); $displayName = trim((string)($body['displayName'] ?? '')); $role = trim((string)($body['role'] ?? 'Inventory Officer')); $password = (string)($body['password'] ?? '');
        if (!$id || $displayName === '' || $role === '' || ($password !== '' && strlen($password) < 6)) respond(['error' => 'Enter a display name and role. New passwords must have at least 6 characters.'], 422);
        $query = $pdo->prepare($password === '' ? 'UPDATE users SET display_name = ?, role = ? WHERE id = ?' : 'UPDATE users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?');
        $query->execute($password === '' ? [$displayName, $role, $id] : [$displayName, $role, hash('sha256', $password), $id]);
        $permissions = permissionData($body); $query = $pdo->prepare('INSERT INTO user_permissions (user_id, can_manage_users, can_manage_inventory, can_manage_stock, can_view_reports) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE can_manage_users = VALUES(can_manage_users), can_manage_inventory = VALUES(can_manage_inventory), can_manage_stock = VALUES(can_manage_stock), can_view_reports = VALUES(can_view_reports)'); $query->execute(array_merge([$id], array_values($permissions)));
        respond(['message' => 'User account updated.']);
    }
    if ($action === 'delete-user') {
        requireAdministrator($user);
        $id = (int)($body['id'] ?? 0); if (!$id || $id === (int)$user['id']) respond(['error' => 'You cannot delete your own account.'], 422);
        $query = $pdo->prepare('DELETE FROM users WHERE id = ?'); $query->execute([$id]); respond(['message' => 'User account deleted.']);
    }

    if ($action === 'bootstrap') {
        $pagePermissions = ['inventory.html' => 'can_manage_inventory', 'stock-entry.html' => 'can_manage_stock', 'report.html' => 'can_view_reports'];
        if (isset($pagePermissions[$body['page'] ?? ''])) requirePermission($user, $pagePermissions[$body['page']]);
        $inventory = array_map('inventoryRow', $pdo->query('SELECT id, item, bf, stock, updated_at FROM inventory ORDER BY item')->fetchAll());
        $transactions = $pdo->query("SELECT DATE_FORMAT(t.created_at, '%d-%b-%Y') date, DATE_FORMAT(t.created_at, '%Y-%m') month, i.item, t.action, t.quantity, t.old_stock oldStock, t.new_stock newStock, COALESCE(u.username, 'System') user FROM transactions t JOIN inventory i ON i.id = t.inventory_id LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC, t.id DESC")->fetchAll();
        foreach ($transactions as &$row) { $row['quantity'] = (int)$row['quantity']; $row['oldStock'] = (int)$row['oldStock']; $row['newStock'] = (int)$row['newStock']; }
        respond(['inventory' => $inventory, 'transactions' => $transactions, 'currentUser' => ['username' => $user['username'], 'displayName' => $user['display_name'], 'role' => $user['role'], 'permissions' => ['canManageUsers' => (bool)$user['can_manage_users'], 'canManageInventory' => (bool)$user['can_manage_inventory'], 'canManageStock' => (bool)$user['can_manage_stock'], 'canViewReports' => (bool)$user['can_view_reports']]]]);
    }
    if ($action === 'add-item') {
        requirePermission($user, 'can_manage_inventory');
        $item = strtoupper(trim((string)($body['item'] ?? '')));
        if ($item === '') respond(['error' => 'Item name is required.'], 422);
        $query = $pdo->prepare('INSERT INTO inventory (item, bf, stock, updated_at) VALUES (?, ?, ?, CURDATE())');
        $query->execute([$item, max(0, (int)($body['bf'] ?? 0)), max(0, (int)($body['stock'] ?? 0))]); respond(['message' => 'Item added.']);
    }
    if ($action === 'update-item') {
        requirePermission($user, 'can_manage_inventory');
        $item = strtoupper(trim((string)($body['item'] ?? ''))); $stock = (int)($body['stock'] ?? -1);
        if (!(int)($body['id'] ?? 0) || $item === '' || $stock < 0) respond(['error' => 'Invalid item details.'], 422);
        $query = $pdo->prepare('UPDATE inventory SET item = ?, stock = ?, updated_at = CURDATE() WHERE id = ?');
        $query->execute([$item, $stock, (int)$body['id']]); respond(['message' => 'Item updated.']);
    }
    if ($action === 'delete-item') {
        requirePermission($user, 'can_manage_inventory');
        $query = $pdo->prepare('DELETE FROM inventory WHERE id = ?'); $query->execute([(int)($body['id'] ?? 0)]); respond(['message' => 'Item deleted.']);
    }
    if ($action === 'stock-entry') {
        requirePermission($user, 'can_manage_stock');
        $item = strtoupper(trim((string)($body['item'] ?? ''))); $entryAction = $body['action'] ?? ''; $quantity = (int)($body['quantity'] ?? 0);
        if ($item === '' || !in_array($entryAction, ['Received', 'Supplied'], true) || $quantity <= 0) respond(['error' => 'Invalid stock entry.'], 422);
        $pdo->beginTransaction();
        $query = $pdo->prepare('SELECT id, stock FROM inventory WHERE item = ? FOR UPDATE'); $query->execute([$item]); $record = $query->fetch();
        if (!$record && $entryAction === 'Supplied') respond(['error' => 'A new item can only be received.'], 422);
        $oldStock = $record ? (int)$record['stock'] : 0; $newStock = $entryAction === 'Supplied' ? $oldStock - $quantity : $oldStock + $quantity;
        if ($newStock < 0) respond(['error' => 'Supplied quantity cannot be greater than current stock.'], 422);
        if (!$record) { $query = $pdo->prepare('INSERT INTO inventory (item, stock, updated_at) VALUES (?, ?, CURDATE())'); $query->execute([$item, $newStock]); $inventoryId = (int)$pdo->lastInsertId(); }
        else { $inventoryId = (int)$record['id']; $query = $pdo->prepare('UPDATE inventory SET stock = ?, updated_at = CURDATE() WHERE id = ?'); $query->execute([$newStock, $inventoryId]); }
        $query = $pdo->prepare('INSERT INTO transactions (inventory_id, action, quantity, old_stock, new_stock, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $query->execute([$inventoryId, $entryAction, $quantity, $oldStock, $newStock, $body['notes'] ?? null, $_SESSION['user_id']]);
        $pdo->commit(); respond(['message' => 'Transaction saved.']);
    }
    if ($action === 'import-items') {
        requirePermission($user, 'can_manage_inventory');
        $pdo->beginTransaction();
        $query = $pdo->prepare('INSERT INTO inventory (item, bf, stock, updated_at) VALUES (?, ?, ?, CURDATE()) ON DUPLICATE KEY UPDATE bf = VALUES(bf), stock = VALUES(stock), updated_at = CURDATE()');
        foreach (($body['items'] ?? []) as $row) $query->execute([strtoupper(trim((string)$row['item'])), max(0, (int)$row['bf']), max(0, (int)$row['stock'])]);
        $pdo->commit(); respond(['message' => 'Inventory imported.']);
    }
    if ($action === 'undo-import') {
        requirePermission($user, 'can_manage_inventory');
        $pdo->beginTransaction();
        $update = $pdo->prepare('UPDATE inventory SET item = ?, bf = ?, stock = ?, updated_at = ? WHERE id = ?');
        $remove = $pdo->prepare('DELETE FROM inventory WHERE item = ?');
        foreach (($body['snapshot'] ?? []) as $row) {
            $item = strtoupper(trim((string)($row['item'] ?? '')));
            if (!$item) continue;
            if ((int)($row['id'] ?? 0)) {
                $update->execute([$item, max(0, (int)($row['bf'] ?? 0)), max(0, (int)($row['stock'] ?? 0)), $row['updated'] ?? date('Y-m-d'), (int)$row['id']]);
            } else {
                $remove->execute([$item]);
            }
        }
        $pdo->commit(); respond(['message' => 'Imported items were undone.']);
    }
    respond(['error' => 'Unknown API action.'], 404);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(['error' => $exception->getCode() === '23000' ? 'That item already exists.' : 'The server could not complete the request.'], 500);
}
