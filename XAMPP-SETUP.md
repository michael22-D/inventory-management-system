# XAMPP setup

1. Start Apache and MySQL in XAMPP.
2. Copy this folder to `C:\xampp\htdocs\IMS`.
3. Open `http://localhost/phpmyadmin` and import `database.sql`.
4. If MySQL root has a password, set it in `api/config.php`.
5. Open `http://localhost/IMS/index.html`.

Demo login: `MZ513332` / `password`.

Administrator login: `admin` / `admin123`. Open `admin.html` after signing in as the administrator to create accounts and assign privileges for user management, inventory management, stock entry, and reports. Change the administrator password after the first login.

Inventory imports accept Excel files only: `.xlsx` or `.xls`.

Use the Apache URL, not a `file:///` URL, because the pages call PHP.
