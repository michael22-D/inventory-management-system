CREATE DATABASE IF NOT EXISTS ims_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ims_database;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash CHAR(64) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    role VARCHAR(80) NOT NULL DEFAULT 'Inventory Officer'
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INT UNSIGNED PRIMARY KEY,
    can_manage_users TINYINT(1) NOT NULL DEFAULT 0,
    can_manage_inventory TINYINT(1) NOT NULL DEFAULT 1,
    can_manage_stock TINYINT(1) NOT NULL DEFAULT 1,
    can_view_reports TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item VARCHAR(150) NOT NULL UNIQUE,
    bf INT UNSIGNED NOT NULL DEFAULT 0,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT UNSIGNED NOT NULL,
    action ENUM('Received', 'Supplied') NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    old_stock INT UNSIGNED NOT NULL,
    new_stock INT UNSIGNED NOT NULL,
    notes TEXT NULL,
    user_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO users (username, password_hash, display_name, role)
VALUES ('MZ513332', SHA2('password', 256), 'Michael Djan', 'Inventory Officer');

INSERT IGNORE INTO users (username, password_hash, display_name, role)
VALUES ('admin', SHA2('admin123', 256), 'System Administrator', 'Administrator');

INSERT IGNORE INTO user_permissions (user_id, can_manage_users, can_manage_inventory, can_manage_stock, can_view_reports)
SELECT id, 1, 1, 1, 1 FROM users WHERE role = 'Administrator';

INSERT IGNORE INTO user_permissions (user_id, can_manage_users, can_manage_inventory, can_manage_stock, can_view_reports)
SELECT id, 0, 1, 1, 1 FROM users WHERE role <> 'Administrator';

INSERT IGNORE INTO inventory (item, bf, stock, updated_at) VALUES
('A4 SHEET', 0, 0, '2026-10-06'),
('ARCHIVE BOXES', 13, 13, '2026-06-15'),
('CEDI DEPOSIT', 463, 463, '2026-06-15'),
('NOTE PADS', 5, 5, '2026-06-08');
