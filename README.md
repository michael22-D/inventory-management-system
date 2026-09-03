# Inventory Management System

This project is a web-based Inventory Management System developed for small-scale businesses to improve inventory control, stock monitoring, and reporting processes.

The system provides functionalities for:

- Inventory management with add, view, edit, delete, and search actions
- Stock entry for received and supplied quantities
- Automatic stock balance and stock-status updates
- Transaction history with search and month filtering
- Inventory reports with all-month or particular-month filtering
- CSV export and print support for inventory reports
- Dashboard monitoring with live stock and transaction summaries
- Low stock identification
- Administrator user management with per-user privileges

## Technologies Used

- HTML5
- CSS3
- JavaScript

## Application Pages

- `index.html` - Login screen
- `dashboard.html` - Live inventory and transaction summary
- `inventory.html` - Inventory records and item management
- `stock-entry.html` - Record received or supplied stock
- `stock-entry.html` - Import inventory from Excel, CSV, or text-based PDF files
- `history.html` - View and filter transaction history
- `report.html` - View, print, and export inventory reports

## Data Storage

The application uses PHP and MySQL/MariaDB. PHP provides the API in `api/index.php`, while MySQL stores users, inventory records, and transaction history. The browser keeps only a temporary in-memory view of data, so all authenticated users see the same records.

Stock entries update the selected inventory item and create a matching transaction-history record. Reports calculate received and supplied totals from those transactions.

The Stock Entry page previews uploaded inventory files before saving. It accepts rows with `ITEM`, `B/F`, and `STOCK` or equivalent column names, ignores totals and invalid rows, and lets users select which rows to import. The importer uses browser libraries loaded from a CDN, so an internet connection is required when opening the page.

The administrator account can create and manage users from `admin.html`. Privileges control user management, inventory changes, stock entries, and report access. The API enforces permissions server-side.


## Running the Application

Use XAMPP to start Apache and MySQL, import `database.sql` through phpMyAdmin, copy the project into `C:\xampp\htdocs\IMS`, and open `http://localhost/IMS/index.html`. Full setup instructions are in `XAMPP-SETUP.md`.

## Project Objective

The aim of this project is to provide a user-friendly and cost-effective solution for managing inventory records, reducing manual errors, improving stock visibility, and enhancing decision-making within small-scale business environments.

## Author

Michael Melchizedek Danso Djan

Bachelor of Technology (Computer Science)

Accra Technical University
