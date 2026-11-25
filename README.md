# SpendSmart — Full-Stack Student Expense Manager

SpendSmart is a responsive, multi-user personal finance web application built with **HTML5, CSS3, vanilla JavaScript, Node.js, Express.js** and **MongoDB (Mongoose)**. It is designed as a college-level Web Technology project with a clean, modern UI.

---

## ✨ Features

### 🔐 Authentication & Accounts
- **Sign Up** — name, email, password, confirm password (bcrypt hashed)
- **Sign In** — email + password → returns a JWT token (7-day expiry)
- **Multi-user data isolation** — every account sees only its own data; new accounts start with a clean slate
- **Change Password** — from the Settings section (verifies current password before updating)
- **Password show/hide** — 👁 eye toggle on every password field across login, signup and change-password

### 📊 Dashboard
- Monthly income, expenses, net cash flow and savings rate cards
- Category-wise monthly spending **donut chart**
- Month-wise **cash-flow comparison** and a rule-based spending observation
- Quick summary of active savings goals

### 💸 Transactions
- Full **CRUD** — add, edit, delete income & expense records
- Fields: title, amount, category, date, notes, recurring label
- **Search & filter** by keyword, category and month
- **CSV export** for the selected month
- **Recurring transaction engine** — automatically generates this month's recurring entries on startup and on every fetch (deduplicates by title + amount + type per month per user)

### 🎯 Savings Goals
- Create goals with a name and target amount
- Track and update saved amount against each goal
- Full CRUD with backend persistence

### 📅 Monthly Budgets
- Set per-category budgets
- Visual **progress bars** with overspending indicators

### ⚙️ Settings
- Display name and display currency preferences
- **Change password** panel with current-password verification and confirmation
- Settings are stored per user (data isolated)

### 📱 Responsive
- Works on desktop, tablet and mobile

---

## 🚀 Run Locally

### 1. Install Node.js LTS
Download from https://nodejs.org

### 2. Open the project folder
```bash
cd SpendSmart_FullStack
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment (optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5000
JWT_SECRET=your_super_secret_key_here
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<dbname>
```

> **Note:** `MONGODB_URI` is optional. If blank or unreachable, the app automatically falls back to a local JSON database at `server/data/db.json` — perfect for demos and development without MongoDB.

### 5. Start the server
```bash
npm run dev
```

### 6. Open in browser
```
http://localhost:5000
```

The Express server serves both the frontend and the API — no separate Live Server needed.

---

## 🌐 Share via Tunnel (optional)
To expose your local server for others to access (e.g. for demos):
```bash
ssh -p 443 -R0:localhost:5000 a.pinggy.io
```
This generates a public HTTPS URL valid for 60 minutes (free tier).

---

## 🔌 API Endpoints

### Auth (Public)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Register new user (name, email, password, confirmPassword) |
| POST | `/api/auth/login` | Log in → returns JWT token |
| GET  | `/api/auth/me` | Get current user profile *(auth required)* |
| PUT  | `/api/auth/change-password` | Change password *(auth required)* |

### Transactions *(auth required)*
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET    | `/api/transactions` | List all transactions for current user |
| POST   | `/api/transactions` | Add a new transaction |
| PUT    | `/api/transactions/:id` | Edit a transaction |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| POST   | `/api/transactions/process-recurring` | Manually trigger recurring processor |

### Budgets & Settings *(auth required)*
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/budgets` | Read category budgets |
| PUT | `/api/budgets` | Save category budgets |
| GET | `/api/settings` | Read user preferences |
| PUT | `/api/settings` | Save user preferences |
| GET | `/api/analytics?month=YYYY-MM` | Monthly totals and category breakdown |

### Goals *(auth required)*
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET    | `/api/goals` | List all goals |
| POST   | `/api/goals` | Create a goal |
| PUT    | `/api/goals/:id` | Update goal progress / target |
| DELETE | `/api/goals/:id` | Delete a goal |

### Utility
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Server and database mode status |

---

## 🗄️ Database Diagnostic
Test your MongoDB Atlas connection at any time:
```bash
npm run test:db
```

---

## 📁 Project Structure

```text
SpendSmart_FullStack/
├── public/
│   ├── index.html          ← Single-page app shell + auth modal
│   ├── css/
│   │   └── style.css       ← All UI styles including auth, password fields
│   └── js/
│       └── app.js          ← Full frontend logic (auth, CRUD, charts, goals)
├── server/
│   ├── server.js           ← Express app entry point, MongoDB connect + fallback
│   ├── testMongo.js        ← MongoDB connection diagnostic script
│   ├── middleware/
│   │   └── auth.js         ← JWT verification middleware
│   ├── routes/
│   │   └── apiRoutes.js    ← All API route definitions
│   ├── controllers/
│   │   ├── authController.js   ← register, login, me, changePassword
│   │   └── spendController.js  ← transactions, budgets, goals, settings, analytics
│   ├── models/
│   │   ├── User.js         ← Mongoose user schema
│   │   ├── Transaction.js  ← Mongoose transaction schema (userId scoped)
│   │   ├── Goal.js         ← Mongoose goal schema (userId scoped)
│   │   └── AppData.js      ← Mongoose key-value store for budgets/settings
│   ├── utils/
│   │   └── dataStore.js    ← Dual-storage layer (MongoDB ↔ JSON fallback)
│   └── data/
│       └── db.json         ← Local JSON database (auto-created, git-ignored)
├── .env                    ← Environment config (git-ignored)
├── .env.example            ← Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## 🔒 Security Notes
- Passwords are **bcrypt-hashed** (salt rounds: 10) — never stored in plain text
- JWT tokens expire after **7 days**
- All data routes are protected by the `auth` middleware
- Each user's transactions, goals, budgets and settings are **strictly isolated** by `userId`

---

## 📝 Project Scope Notes
- **No bank sync** — transactions are entered manually (by design, college project scope)
- **No payment gateway** — this is a tracker, not a payment app
- **No email/SMS alerts** — notifications are in-app only
- **Recurring transactions** are a tracking label; they do not auto-debit or auto-credit real money
