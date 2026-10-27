# QuizMaster — Online Quiz Competition Platform

A MERN-stack platform for running timed, secure MCQ competitions. An organiser (admin) creates participant accounts and competitions; participants sign in with the credentials they were given, take the quiz inside a server-enforced time window, and see their score, answer key, and leaderboard **only when the organiser releases them**.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS 3, Lucide icons |
| Backend | Node 18+, Express 4, Mongoose 8, Zod validation |
| Database | MongoDB Atlas |
| Auth | Dual-layer: JWT in an `httpOnly` cookie (`SameSite: 'none'` on HTTPS, 'lax' locally) + `Authorization: Bearer` fallback in headers for iframe/cross-origin resilience |
| Hosting | Vercel (client) · Render (API: `https://klebbaquiz.onrender.com`) · MongoDB Atlas (DB) |

```
quizmaster/
├── .github/workflows/
│   └── admin-task.yml             Manual GitHub Actions workflow for zero-cost cloud admin operations
├── client/                        React app (deploys to Vercel)
│   ├── vercel.json                /api → Render rewrite + security headers
│   └── src/pages/{admin,student}
├── server/                        Express API (deploys to Render)
│   ├── src/{models,controllers,routes,middleware,services,validators}
│   ├── scripts/
│   │   ├── createAdmin.js         Secure admin creation CLI (setup-admin)
│   │   ├── resetAdminPassword.js  Secure admin password recovery & account unlock CLI
│   │   ├── checkAdminStatus.js    Safe diagnostic tool to inspect DB accounts
│   │   └── seed.js                Development sample competition + demo participants
│   ├── data/sample-quiz.json      Sample quiz data (10 questions)
│   └── tests/
│       ├── e2e.test.js            Full end-to-end competition lifecycle tests
│       └── admin-security.test.js Dedicated admin auth, duplicate check, and recovery tests
├── render.yaml                    Render blueprint for backend
└── README.md
```

---

## 1. Production Admin Setup & Recovery (Without Render Shell)

If you cannot access the Render Shell (e.g., on a free or starter tier where Shell requires a paid subscription), you have two secure, zero-cost options to manage the production database directly:

### Option A: Using GitHub Actions (Recommended — Zero Network/IP Setup)

Since mobile networks have dynamic IP addresses that are often blocked by MongoDB Atlas network filters, the easiest and most secure cloud method is using the built-in manual GitHub Actions workflow:

1. **Add Repository Secrets**:
   - Go to your GitHub repository: **Settings → Secrets and variables → Actions**.
   - Add repository secret `MONGODB_URI`: your production MongoDB Atlas connection string (e.g., `mongodb+srv://<user>:<password>@cluster0.mongodb.net/quizmaster?retryWrites=true&w=majority`).
   - Add repository secret `JWT_SECRET`: your secret key (≥ 32 chars).
2. **Execute the Workflow**:
   - In GitHub, navigate to the **Actions** tab.
   - Click **Production Admin Operations** in the left sidebar.
   - Click **Run workflow** (top right dropdown).
   - Select the operation:
     - `check-status`: Inspects existing administrators, active status, and lockout state (no credentials printed).
     - `setup-admin`: Creates a new administrator account (refuses duplicates, never overwrites).
     - `reset-password`: Verifies existing account has `role: 'admin'`, updates the password, clears account lockouts (`failedLoginCount: 0`), and invalidates stale sessions.
   - Enter your desired `admin_username` and `admin_password`.
   - Click **Run workflow**.
   *(GitHub Actions automatically masks the password in execution logs, ensuring credentials are never exposed.)*

---

### Option B: Using Termux on Android or a Local Terminal

You can run the secure CLI tools directly against your production MongoDB Atlas database:

#### 1. Termux Setup
```bash
# In Termux (Android):
pkg update -y && pkg install nodejs-lts git -y
git clone https://github.com/vishalkshirsagr4-lab/klebbaquiz.git
cd klebbaquiz
npm ci --omit=dev
```

#### 2. MongoDB Atlas Network Access Configuration
> ⚠️ **Important Atlas Constraint**: By default, MongoDB Atlas blocks connections from unapproved IP addresses. Mobile networks use dynamic carrier-grade NAT (CGNAT) IPs that change frequently.
> If you get `MongoServerSelectionError: connection timed out`:
> 1. Log into [MongoDB Atlas](https://cloud.mongodb.com).
> 2. Navigate to **Security → Network Access**.
> 3. Click **Add IP Address**.
> 4. Select **Allow Access From Anywhere** (`0.0.0.0/0`) temporarily while running the script, or add your current mobile IP. (Since your database user has a strong password, `0.0.0.0/0` is commonly used for cloud hosting like Render).

#### 3. Diagnose Production Account Status
Check if an administrator account already exists, what the username is, and if it is locked:
```bash
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/quizmaster?retryWrites=true&w=majority" npm run check-admin-status
```

#### 4. Initialize a New Administrator
Interactive mode (prompts for username, name, email, and masks password input):
```bash
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/quizmaster?retryWrites=true&w=majority" npm run setup-admin
```
Non-interactive mode (for automation):
```bash
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/quizmaster?retryWrites=true&w=majority" \
ADMIN_USERNAME="admin" \
ADMIN_NAME="QuizMaster Administrator" \
ADMIN_EMAIL="admin@quizmaster.com" \
ADMIN_PASSWORD="YourStrongPassword123!" \
npm run setup-admin
```

#### 5. Reset an Existing Administrator's Password & Unlock Account
If the account is already registered but displays "Incorrect ID or password" or is locked:
```bash
MONGODB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/quizmaster?retryWrites=true&w=majority" npm run reset-admin-password
```
*(Prompts for the admin username/email and the new password, unlocks the account, resets failed login counters, and logs an audit record.)*

---

## 2. Login Troubleshooting: "Incorrect ID or password"

If you encounter "Incorrect ID or password" when attempting to log in on production:

| Possible Cause | Explanation | Fix |
|---|---|---|
| **Account does not exist in production DB** | Database has not been seeded or initialized with an admin. | Run `npm run check-admin-status` to verify. If empty, run `npm run setup-admin`. |
| **Password mismatch or typo** | The password entered does not match the bcrypt hash in the database. | Run `npm run reset-admin-password` to set a known password. |
| **Account temporarily locked** | 5 consecutive failed login attempts trigger a 15-minute lockout (HTTP 423 `ACCOUNT_LOCKED`). | Running `npm run reset-admin-password` immediately clears `lockUntil` and resets `failedLoginCount: 0`. |
| **Username case sensitivity** | The login query matches `username: identifier.toLowerCase()` and `email: identifier.toLowerCase()`. | Verify the exact username using `npm run check-admin-status`. |
| **Account deactivated** | `isActive` is set to `false`. | `npm run reset-admin-password` reactivates the account (`isActive: true`). |
| **CSRF / Origin blocked** | Render rejected the cross-origin request. | The backend now allows all `.vercel.app` and `.onrender.com` origins automatically, and accepts the client `X-Requested-With: quizmaster` header. Ensure Render has `CLIENT_URL` configured to your Vercel URL. |
| **Iframe / Cookie blocking** | Browser blocked third-party cookies. | The frontend API client now attaches `Authorization: Bearer <token>` in addition to standard cookies. |

---

## 3. Required Environment Variables

### Backend (Render Web Service)
Set these in the Render Dashboard (**Environment** tab):

| Variable | Description | Example / Default |
|---|---|---|
| `NODE_ENV` | Application environment | `production` |
| `PORT` | Web server port | `3000` (or assigned by Render) |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://admin:pass@cluster0.abc.mongodb.net/quizmaster?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key for signing session JWTs | Long random string (≥ 32 chars) |
| `CLIENT_URL` | Frontend origin(s) permitted for CORS and CSRF | `https://quizmaster.vercel.app` (comma-separated for multiple) |
| `COOKIE_SAMESITE` | Cookie SameSite policy | `lax` (or `none` if frontend and backend are on completely different domains without Vercel rewrite) |
| `TRUST_PROXY` | Proxy hops | `2` (Browser → Vercel rewrite → Render) |
| `JWT_EXPIRES_HOURS` | Session validity duration | `8` |
| `BCRYPT_ROUNDS` | Password hash complexity cost | `12` |
| `MAX_LOGIN_ATTEMPTS` | Failed attempts before lockout | `5` |
| `LOCKOUT_MINUTES` | Account lockout duration | `15` |
| `ALLOW_SEED` | Guard for auto-seeding sample data | `false` (never seed hardcoded test users in production) |

### Frontend (Vercel)
- When using the default `client/vercel.json` rewrite (`/api/:path* → https://klebbaquiz.onrender.com/api/:path*`), leave `VITE_API_URL` **unset**.
- If making direct cross-origin calls without the Vercel rewrite: set `VITE_API_URL=https://klebbaquiz.onrender.com/api`.

---

## 4. Local Development

### Prerequisites
Node.js ≥ 18.18, npm.

### Setup
```bash
# 1. Clone repository
git clone https://github.com/vishalkshirsagr4-lab/klebbaquiz.git
cd klebbaquiz

# 2. Install all workspace dependencies
npm install

# 3. Create local environment file
cp .env.example .env
# Fill in JWT_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
```

### Running Locally
```bash
npm run dev
```
The unified dev server starts on `http://0.0.0.0:3000` with MongoMemoryServer for immediate local development.

---

## 5. Security Architecture & Rules Enforcement

| Security Area | Implementation Details |
|---|---|
| **No Public Registration** | There is no user registration endpoint. Only an authenticated administrator can create student participants (`POST /api/admin/users/bulk`). |
| **Strict Password Rules** | Minimum 10 characters, at least one uppercase letter, one lowercase letter, and one number. Validated via Zod on server. |
| **Bcrypt Password Hashing** | Passwords are never stored in plaintext. Hashed with bcrypt (`BCRYPT_ROUNDS=12` in production). |
| **Account Lockout Defense** | After 5 failed attempts, the account is locked for 15 minutes to defeat brute-force and dictionary attacks. |
| **CSRF Defense** | State-changing API calls require custom header `X-Requested-With: quizmaster` plus origin validation. |
| **Token Versioning** | On password change, password recovery, or admin deactivation, `tokenVersion` increments, immediately invalidating any active JWT session. |
| **Sealed Question Keys** | `correctOption` and `explanation` are filtered with Mongoose `select: false`. Question answers never reach the browser before explicit publication. |
| **Immutable Audit Logging** | All admin operations, logins, failed logins, password changes, and CLI recovery actions write tamper-evident records to the `AuditLog` collection. |
| **Production Seeding Guard** | `seedDefaults.js` refuses to seed default credentials in production mode unless explicitly instructed via `ALLOW_SEED=true`. |

---

## 6. Running Tests

The test suite runs against an isolated, in-memory MongoDB instance and never touches production data:

```bash
npm test
```

Exercises 26 comprehensive tests:
- Admin account creation with password hashing and complexity rules
- Duplicate username and email prevention
- Valid and invalid login authentication
- Account lockout after maximum failed attempts
- Admin password recovery, account unlocking, and session revocation
- Role authorization and protection of administrative endpoints
- Prevention of answer key leakage in quiz payloads
- Server-side deadline and submission enforcement
- CSRF header and origin enforcement
