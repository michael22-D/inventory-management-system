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

$action = $_GET['action'] ?? '';
$body = requestBody();

try {
    if ($action === 'login') {
        $query = $pdo->prepare('SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?');
        $query->execute([trim((string)($body['username'] ?? ''))]);
        $user = $query->fetch();
        if (!$user || !hash_equals($user['password_hash'], hash('sha256', (string)($body['password'] ?? '')))) respond(['error' => 'Invalid username or password.'], 401);
        $_SESSION['user_id'] = (int)$user['id'];
        respond(['user' => ['username' => $user['username'], 'displayName' => $user['display_name'], 'role' => $user['role']]]);
    }
    if (!isset($_SESSION['user_id'])) respond(['error' => 'Please log in first.'], 401);

    if ($action === 'bootstrap') {
        $inventory = array_map('inventoryRow', $pdo->query('SELECT id, item, bf, stock, updated_at FROM inventory ORDER BY item')->fetchAll());
        $transactions = $pdo->query("SELECT DATE_FORMAT(t.created_at, '%d-%b-%Y') date, DATE_FORMAT(t.created_at, '%Y-%m') month, i.item, t.action, t.quantity, t.old_stock oldStock, t.new_stock newStock, COALESCE(u.username, 'System') user FROM transactions t JOIN inventory i ON i.id = t.inventory_id LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC, t.id DESC")->fetchAll();
        foreach ($transactions as &$row) { $row['quantity'] = (int)$row['quantity']; $row['oldStock'] = (int)$row['oldStock']; $row['newStock'] = (int)$row['newStock']; }
        respond(['inventory' => $inventory, 'transactions' => $transactions]);
    }
    if ($action === 'add-item') {
        $item = strtoupper(trim((string)($body['item'] ?? '')));
        if ($item === '') respond(['error' => 'Item name is required.'], 422);
        $query = $pdo->prepare('INSERT INTO inventory (item, bf, stock, updated_at) VALUES (?, ?, ?, CURDATE())');
        $query->execute([$item, max(0, (int)($body['bf'] ?? 0)), max(0, (int)($body['stock'] ?? 0))]); respond(['message' => 'Item added.']);
    }
    if ($action === 'update-item') {
        $item = strtoupper(trim((string)($body['item'] ?? ''))); $stock = (int)($body['stock'] ?? -1);
        if (!(int)($body['id'] ?? 0) || $item === '' || $stock < 0) respond(['error' => 'Invalid item details.'], 422);
        $query = $pdo->prepare('UPDATE inventory SET item = ?, stock = ?, updated_at = CURDATE() WHERE id = ?');
        $query->execute([$item, $stock, (int)$body['id']]); respond(['message' => 'Item updated.']);
    }
    if ($action === 'delete-item') {
        $query = $pdo->prepare('DELETE FROM inventory WHERE id = ?'); $query->execute([(int)($body['id'] ?? 0)]); respond(['message' => 'Item deleted.']);
    }
    if ($action === 'stock-entry') {
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
        $pdo->beginTransaction();
        $query = $pdo->prepare('INSERT INTO inventory (item, bf, stock, updated_at) VALUES (?, ?, ?, CURDATE()) ON DUPLICATE KEY UPDATE bf = VALUES(bf), stock = VALUES(stock), updated_at = CURDATE()');
        foreach (($body['items'] ?? []) as $row) $query->execute([strtoupper(trim((string)$row['item'])), max(0, (int)$row['bf']), max(0, (int)$row['stock'])]);
        $pdo->commit(); respond(['message' => 'Inventory imported.']);
    }
    respond(['error' => 'Unknown API action.'], 404);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(['error' => $exception->getCode() === '23000' ? 'That item already exists.' : 'The server could not complete the request.'], 500);
}
