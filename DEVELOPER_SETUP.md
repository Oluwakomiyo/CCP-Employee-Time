# CCP Time: Developer Setup

How to get CCP Time running on your own computer, on **Windows**, **macOS** or **Linux**. It takes about 20 minutes the first time.

When you're done you'll have:

| Part | Address | What it is |
|---|---|---|
| Web app | http://localhost:3000 | The Next.js site everyone uses |
| API | http://localhost:5000 | The Express server the web app talks to |
| Database | localhost:5432 | PostgreSQL, holding all the data |

The web app forwards every `/api/v1/...` request to the API, so you only ever open **http://localhost:3000** in the browser.

---

## 1. Install the tools

You need three things: **Git**, **Node.js 22** (20.9 or newer works) and **PostgreSQL 16 or newer**. Docker is optional (see [the Docker shortcut](#docker-shortcut-database-only)).

### Windows
1. **Git:** install from https://git-scm.com/download/win (the defaults are fine).
2. **Node.js 22 LTS:** install the Windows installer (`.msi`) from https://nodejs.org. Tick "Automatically install the necessary tools" if asked.
3. **PostgreSQL:** install from https://www.postgresql.org/download/windows/ (the EDB installer).
   - Remember the password you set for the `postgres` user.
   - Keep port **5432**.
   - The installer also adds **SQL Shell (psql)** to the Start menu.

Use **PowerShell** or **Command Prompt** for the commands below. If PowerShell says *"npm.ps1 cannot be loaded because running scripts is disabled"*, run this once and reopen PowerShell:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### macOS
With [Homebrew](https://brew.sh):
```bash
brew install git node@22 postgresql@16
brew link --force node@22
brew services start postgresql@16
```
(Postgres.app from https://postgresapp.com works too, instead of the Homebrew PostgreSQL.)

### Linux (Ubuntu / Debian)
```bash
sudo apt update
sudo apt install -y git postgresql
# Node 22 from NodeSource (the distro's nodejs package is often too old)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo systemctl enable --now postgresql
```
On Fedora: `sudo dnf install git nodejs postgresql-server`, then run `sudo postgresql-setup --initdb` and `sudo systemctl enable --now postgresql`.

**Check everything is installed** (any OS):
```bash
git --version
node --version     # v22.x (anything from v20.9 works)
npm --version
psql --version     # 16 or newer
```

---

## 2. Get the code

You need access to the GitHub repository; ask the owner to add you.
```bash
git clone git@github.com:Oluwakomiyo/CCP-Employee-Time.git
cd CCP-Employee-Time
```
(Use the HTTPS address from the GitHub page instead if you haven't set up an SSH key.)

---

## 3. Create the database user and databases

The app expects a PostgreSQL user called **`ccp`** with password **`ccp`**, and two databases:
- **`ccp_time`** for the app;
- **`ccp_time_test`**, which the tests wipe on every run.

These are development-only credentials. Never use them on a real server.

**Open a PostgreSQL prompt as the admin user:**

| OS | Command |
|---|---|
| Windows | Start menu → **SQL Shell (psql)** → press Enter for each default, then type the `postgres` password you chose |
| macOS (Homebrew) | `psql postgres` |
| macOS (Postgres.app) | Click the elephant → **Open psql** |
| Linux | `sudo -u postgres psql` |

**Then paste these three lines:**
```sql
CREATE ROLE ccp LOGIN PASSWORD 'ccp' CREATEDB;
CREATE DATABASE ccp_time OWNER ccp;
CREATE DATABASE ccp_time_test OWNER ccp;
```
Type `\q` to leave.

---

## 4. Configure the API

Copy the example settings file:

| OS | Command (run from the project folder) |
|---|---|
| Windows (PowerShell) | `Copy-Item server\.env.example server\.env` |
| Windows (Command Prompt) | `copy server\.env.example server\.env` |
| macOS / Linux | `cp server/.env.example server/.env` |

Open `server/.env` in your editor. The database lines already match step 3. You only need to fill in **two secrets**. Generate a random value (this works on every OS):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run it twice, then paste one result after `JWT_SECRET=` and the other after `JWT_REFRESH_SECRET=`. The API refuses to start while either is empty.

The web app needs no settings file for local development; it assumes the API is at `http://localhost:5000`. To point it somewhere else, create `web/.env.local` containing `API_ORIGIN=http://your-api:5000`.

---

## 5. Install, migrate and load demo data

```bash
cd server
npm install
npx prisma migrate deploy     # creates all the tables
npx prisma db seed            # loads demo accounts, projects and two weeks of time
cd ../web
npm install
cd ..
```

---

## 6. Run it

You need **two terminals**, both in the project folder:

| Terminal 1: API | Terminal 2: web app |
|---|---|
| `npm run dev` | `npm run dev:web` |
| Wait for `🚀 API Server running at http://localhost:5000` | Wait for `Ready` |

Open **http://localhost:3000** and sign in with any demo account (password `Password123!` for all):

| Email | Role | What you'll see |
|---|---|---|
| `ceo@example.com` | CEO (admin) | Everything, including pay, payroll and settings |
| `manager@example.com` | Project manager | Leads all three demo projects |
| `john@example.com` | Employee | Has a missing clock-out to fix |
| `mary@example.com` | Employee | Has a correction waiting for review |
| `peter@example.com` | Employee | Site supervisor |

Both servers reload automatically when you save a file.

---

## 7. Run the tests and checks

From the project folder:
```bash
npm test                          # API tests (resets ccp_time_test first)
cd web && npx tsc --noEmit && npm run lint   # web typecheck and lint
```
All tests should pass. The test output includes a few lines saying `AuditLog rows are immutable`. That's expected: one test checks that the audit log can't be edited.

---

## Docker shortcut (database only)

If you have Docker Desktop (Windows or macOS) or Docker Engine (Linux), you can skip installing PostgreSQL and do this instead of step 3:
```bash
docker compose up -d db
docker compose exec db createdb -U ccp ccp_time_test
```
This starts PostgreSQL 16 with the `ccp` user and the `ccp_time` database already created. Then carry on from step 4.

To run the **whole stack** in containers (database, API, background worker and web), as on a server, see `DEPLOYMENT.md`. You'll need to set `JWT_SECRET` and `JWT_REFRESH_SECRET` first.

---

## Optional: the desktop app and the activity agent

**Desktop app** (a window onto the web app, with a tray icon). With the web app running:
```bash
cd electron
npm install
npm start
```
On Linux, if it complains about the sandbox, use `npm start -- --no-sandbox`.

**Activity agent** (reports whether a computer is in use, for the Work evidence page):
1. Sign in as the CEO, open **Settings → Desktop devices → Register device**, and copy the key it shows.
2. Copy `desktop-agent/config.example.json` to `desktop-agent/config.json`. Fill in `deviceIdentifier` exactly as registered, and `deviceKey`. Never commit this file; it's already ignored by git.
3. Run `cd desktop-agent && npm start`.

How it reads idle time on each OS:
- **Windows:** PowerShell; nothing to install.
- **macOS:** `ioreg`; nothing to install.
- **Linux:** needs `xprintidle` (`sudo apt install xprintidle`). It only works on X11, so on Wayland the agent reports "unknown" rather than guessing.

---

## Everyday commands

| Task | Command (from the project folder) |
|---|---|
| Start the API | `npm run dev` |
| Start the web app | `npm run dev:web` |
| Run the API tests | `npm test` |
| Reset the dev database to fresh demo data | `cd server && npx prisma migrate reset` (answer `y`; it re-seeds automatically) |
| Reload demo data without wiping the schema | `cd server && npx prisma db seed` |
| Browse the database in a UI | `cd server && npx prisma studio` |
| Create a new migration after editing `schema.prisma` | `cd server && npx prisma migrate dev --name what_changed` |

---

## Troubleshooting

**`JWT_SECRET is required` (or the API exits straight away)**
You haven't filled in both secrets in `server/.env` (step 4).

**`P1001: Can't reach database server at localhost:5432`**
PostgreSQL isn't running:
- **Windows:** open Services, find "postgresql-x64-16" and press Start.
- **macOS:** `brew services start postgresql@16`.
- **Linux:** `sudo systemctl start postgresql`.

**`P1000: Authentication failed against database server`**
The `ccp` user doesn't exist or has a different password. Repeat step 3.

**`permission denied to create database` when running `npm test`**
The `ccp` user is missing `CREATEDB`. In psql as the admin user, run: `ALTER ROLE ccp CREATEDB;`

**`Port 3000 (or 5000) is already in use`**
Another program is using the port. Close it, or find it:
- **Windows:** `netstat -ano | findstr :5000`, then end that process in Task Manager.
- **macOS / Linux:** `lsof -i :5000`, then `kill <PID>`.

**The web app loads but every page shows an error, or login fails**
The API isn't running, or isn't on port 5000. Check terminal 1.

**Login works, then you're thrown back to the sign-in page**
Your browser is blocking cookies for localhost. Allow cookies, or try a private window.

**Windows: `'prisma' is not recognized`**
Run it through npx (`npx prisma ...`) from inside the `server` folder, after `npm install`.

**Windows: Git turned the `.sh` scripts into Windows line endings**
The repository's `.gitattributes` prevents this for new clones. If you cloned before it existed, the simplest fix is to clone again.

**Something is odd and you want a clean slate**
`cd server && npx prisma migrate reset` wipes the dev database and reloads the demo data.

---

## Where to go next

- `README.md`: a short overview of the project.
- `ARCHITECTURE.md`: how the API and the web app are organised.
- `API.md`: every endpoint.
- `DATABASE.md`: tables, migrations and key rules.
- `SECURITY.md`: sessions, permissions and secrets.
- `DEPLOYMENT.md`: running it on a server with Docker.
- `SIGNOFF.md`: the coding rules for this project (read this before changing code).
- `USER_GUIDE.md`: how people use the app.
