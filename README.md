# KhataDesk

A desktop-first ledger app for small shops, in the spirit of Khatabook. Make as many ledgers as you
need, keep a running account for every customer and supplier, and see sales and dues on a dashboard.

**Stack:** React (Vite) · Python (FastAPI + SQLAlchemy) · MySQL

## What it does

- **Dynamic ledgers.** Create any number of ledgers: Customers, Suppliers, a Cash book, or a custom
  one (staff advances, committee money, loans). Name the two sides yourself ("Advance given" and
  "Repaid"). The ledger kind decides how balances add up.
- **Fast data entry.** Press `N` anywhere. Type a name (a new name creates the person on the spot),
  type the amount, press Enter. From a person's page, "You gave" and "You got" open with the amount
  already focused.
- **Dashboard.** To receive, to pay, sales this month against the same days last month, collected,
  cash in hand, a 30-day sales chart, who to collect from (with a WhatsApp reminder link), and what to pay.
- **Daybook.** Every entry across ledgers, filter by period, ledger or text, export CSV.
- **Person pages.** Running balance after every entry, edit or delete any entry, export CSV.

How the kinds work:

| Kind | First button | Second button | Balance means |
| --- | --- | --- | --- |
| Customers | You gave (credit sale) | You got (payment) | what they owe you |
| Suppliers | You paid | You bought (credit) | what you owe them |
| Cash book | Cash out | Cash in | money in hand |
| Custom | your word | your word | second minus first |

Sales on the dashboard = credit given to customers + cash in on a cash book.

## Run it

### 1. MySQL

```bash
docker compose up -d db
```

No Docker? Create the database and user by hand:

```sql
CREATE DATABASE khata CHARACTER SET utf8mb4;
CREATE USER 'khata'@'%' IDENTIFIED BY 'khata';
GRANT ALL ON khata.* TO 'khata'@'%';
```

The connection string is read from `DATABASE_URL` (default
`mysql+pymysql://khata:khata@127.0.0.1:3306/khata`). Tables are created on first start.

### 2. Backend

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python seed.py          # optional: sample shop data
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

For development (hot reload, proxies `/api` to port 8000):

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

For a single-process app, build once and let the API serve it:

```bash
cd frontend && npm install && npm run build
cd ../backend && uvicorn app.main:app --port 8000   # http://localhost:8000
```

## Windows app (setup.exe)

KhataDesk can be installed on a Windows 10 or 11 computer like any other program. The installer
carries its own copy of Python and the server, so nothing else needs installing. It starts the server
on that computer only (`127.0.0.1`), opens KhataDesk in its own window, and keeps your ledgers in
`%APPDATA%\KhataDesk\khata.db`.

**Build the installer** (needs Windows, Node.js 20+, Python 3.11+ and [Inno Setup 6](https://jrsoftware.org/isdl.php)):

```bat
build-windows.bat
```

The result is `release\KhataDesk-Setup-1.0.0.exe`. No Windows machine? Push the project to GitHub and run
the **Windows installer** workflow from the Actions tab. It builds the same file and attaches it to
the run.

Using the installed app:

- Open it from the Start menu or desktop shortcut. Use **Quit KhataDesk** in the sidebar to stop it.
  Closing only the window leaves it running quietly, so opening it again is instant.
- **Backups:** copy `%APPDATA%\KhataDesk\khata.db` somewhere safe. Uninstalling the program does
  not delete your data.
- **Use MySQL instead of the built-in file:** create `%APPDATA%\KhataDesk\settings.json` with
  `{"database_url": "mysql+pymysql://khata:khata@127.0.0.1:3306/khata?charset=utf8mb4"}`.
- The log is `%APPDATA%\KhataDesk\khatadesk.log`.
- Windows SmartScreen may warn "unknown publisher" because the installer is not code-signed. Choose
  More info, then Run anyway. Signing needs a paid certificate.

### Tests

```bash
cd backend && python -m pytest                     # runs on in-memory SQLite
TEST_DATABASE_URL="mysql+pymysql://khata:khata@127.0.0.1:3306/khata_test" python -m pytest   # on MySQL
```

The MySQL run drops and recreates tables in the database it points at, so use a scratch database.

## Layout

```
backend/app/      models.py  schemas.py  services.py (balances, dashboard)  main.py (routes)
backend/seed.py   sample data (replace with your own)
frontend/src/     pages/  components/  store.jsx  styles.css
```

## Not included yet

- **Login and multiple users.** Anyone who can reach the server can read and change the data. Keep it on
  your own machine or behind your network until auth is added.
- Backups. Use `mysqldump`.
- Rupees only, with Indian digit grouping.
