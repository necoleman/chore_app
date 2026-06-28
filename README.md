# Family Chore Tracker

A lightweight PWA for tracking household chores, backed by Google Sheets and Google Apps Script. Installs on iPhone and Android without an app store. Push reminders via Firebase Cloud Messaging.

---

## Prerequisites

- A Google account (to own the Sheet and Apps Script)
- A Firebase project (free tier is fine — you only need FCM)
- Node.js 18+ (for the frontend build)
- A place to host static files — GitHub Pages works and is free

---

## Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet. Name it **Family Chores**.

2. Create four tabs named exactly: `People`, `Chores`, `Assignments`, `Locations`.

3. Add these header rows (row 1) to each tab:

**People**
```
person_id | name | color | fcm_token | points_total | streak_current | streak_best | is_admin
```

**Chores**
```
chore_id | name | location | description | points | frequency | custom_days | monthly_day | interval_days | once_date | last_generated_date | default_assignee | requires_approval | active
```

**Locations** (feeds the location dropdown in the chore editor — one row per allowed location)
```
location
```
Example rows: `Kitchen`, `Living room`, `Garage`, `Upstairs bath`. Add or remove rows here anytime; the change shows up in the app on the next load (no redeploy needed).

**Assignments**
```
assignment_id | chore_id | person_id | due_date | status | completed_at | assigned_by | points_awarded | reviewed_by | reviewed_at | review_note | last_modified_by | last_modified_at
```

4. Add at least one row to the `People` tab for yourself. Use a short `person_id` like `p_yourname`. Set `is_admin` to `TRUE` for parent accounts, `FALSE` for kids. Pick a hex color like `#16a34a` for the avatar.

5. Copy the **Spreadsheet ID** from the URL bar — it's the long string between `/d/` and `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```

---

## Step 2 — Set Up Apps Script

1. From inside the spreadsheet, go to **Extensions → Apps Script**. This opens a bound script project.

2. Delete the default `Code.gs` content. Then create the following files (use the **+** button next to "Files" to add each one) and paste in the contents from the `apps-script/` folder in this repo:

   - `Code.gs`
   - `SheetUtils.gs`
   - `DateUtils.gs`
   - `Endpoints.gs`
   - `Generator.gs`
   - `Streaks.gs`
   - `Reminders.gs`

3. Replace `appsscript.json` with the one from `apps-script/appsscript.json` in this repo. To see this file in the editor, go to **Project Settings → Show "appsscript.json" manifest file in editor**.
   - Set `timeZone` to your family's timezone (e.g. `"America/Chicago"`). This is critical — the nightly generator uses it to determine what "today" is.

4. Set **Script Properties** (this is where credentials live — never in the code):
   - Go to **Project Settings → Script Properties → Add script property**
   - Add all of these:

   | Property | Value |
   |---|---|
   | `SPREADSHEET_ID` | The ID you copied in Step 1 |
   | `FCM_PROJECT_ID` | Your Firebase project ID (set up in Step 3) |
   | `FCM_CLIENT_EMAIL` | Service account email from Firebase (Step 3) |
   | `FCM_PRIVATE_KEY` | Service account private key from Firebase (Step 3) |
   | `REMINDER_HOUR` | Hour (24h) to start sending reminders, e.g. `18` for 6pm |

6. Run the **`setup`** function once to create the time-based triggers:
   - In the editor, select `setup` from the function dropdown and click **Run**
   - Approve the permission prompt (it needs access to your spreadsheet and external requests)
   - This creates three triggers: nightly generator (12am), streak maintenance (11pm), reminder push (every 30 min)
   - You can verify them under **Triggers** (clock icon in the left sidebar)

7. Deploy the script as a **Web App**:
   - Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the Web App URL — you'll need it in Step 4

   > **Important:** Every time you edit the Apps Script code and want the live endpoint to pick up the changes, you must click **Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy**. Editing the code alone does not update the live URL.

---

## Step 3 — Set Up Firebase (for push notifications)

> **Two separate sets of credentials — don't mix them up.** Push notifications need both a *client* config (so the app can receive notifications and register device tokens) and a *server* config (so Apps Script can send them). They are different values, live in different places, and have different sensitivity:
>
> | | **Client config** (`VITE_FCM_*`) | **Server config** (service account) |
> |---|---|---|
> | What it is | Firebase **web app** config: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, plus the VAPID key | Service-account key: `client_email`, `private_key`, `project_id` |
> | Used by | The frontend (`src/lib/fcm.js`) **and** the service worker (`src/sw.js`) | The Apps Script backend (`Reminders.gs`) |
> | Where it goes (local) | `frontend/.env.local` | n/a |
> | Where it goes (deployed) | **GitHub repository secrets** (see Step 5) — inlined into the bundle at build time | Apps Script **Script Properties** (Step 2) |
> | Secret? | **No** — Firebase web keys are public by design and are visible in the built JS | **Yes** — the private key must never be committed or exposed client-side |
>
> Sub-steps 2–3 below collect the **client** config; sub-step 4 collects the **server** config.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project (or use an existing one). You do not need Firestore, Auth, or any other Firebase service — only FCM.

2. **(Client config)** In the Firebase console, go to **Project Settings** (gear icon) **→ General → Your apps → Add app → Web (`</>`)**. Register the app and copy the `firebaseConfig` object — these map to the `VITE_FCM_*` values in your `.env.local` (Step 4), and to GitHub repository secrets for the deployed build (Step 5).

3. **(Client config)** In **Project Settings → Cloud Messaging**:
   - Under **Web Push certificates**, click **Generate key pair** and copy the VAPID key → `VITE_FCM_VAPID_KEY`.

4. **(Server config)** Create a service account for server-side FCM (used by Apps Script):
   - Go to **Project Settings → Service accounts → Generate new private key**
   - Download the JSON file. **Do not commit this file.** Copy the values into the Apps Script Script Properties you set in Step 2:
     - `FCM_CLIENT_EMAIL` ← `client_email` from the JSON
     - `FCM_PRIVATE_KEY` ← `private_key` from the JSON (the full string including `-----BEGIN...`)
     - `FCM_PROJECT_ID` ← `project_id` from the JSON
   - These go **only** in Script Properties — never in `.env.local` or repository secrets.

---

## Step 4 — Configure and Build the Frontend

1. In the `frontend/` directory, copy the example env file:

   **PowerShell:**
   ```powershell
   Copy-Item .env.example .env.local
   ```
   **bash / Git Bash:**
   ```bash
   cp .env.example .env.local
   ```

2. Fill in `.env.local` with your values:
   ```
   VITE_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec

   VITE_FCM_API_KEY=...
   VITE_FCM_AUTH_DOMAIN=...
   VITE_FCM_PROJECT_ID=...
   VITE_FCM_STORAGE_BUCKET=...
   VITE_FCM_MESSAGING_SENDER_ID=...
   VITE_FCM_APP_ID=...
   VITE_FCM_VAPID_KEY=...
   ```

3. Add app icons. Place PNG files at:
   - `frontend/public/icons/icon-192.png` (192×192)
   - `frontend/public/icons/icon-512.png` (512×512, should be maskable)

4. Install dependencies and run locally to verify. **All npm commands must be run from the `frontend/` directory**, not the repo root:

   **PowerShell:**
   ```powershell
   cd C:\Users\colem\Documents\Projects\chore_app\frontend
   npm install
   npm run dev
   ```
   **bash / Git Bash:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser. The onboarding screen should appear and load your People list from the Sheet.

5. Build for production (still from `frontend/`):
   ```powershell
   npm run build
   ```
   The output is in `frontend/dist/`.

---

## Local Testing (Windows / PowerShell)

Everything in this section assumes you are running **Windows 11 with PowerShell 5.1** (the version that ships with Windows). Commands have been tested in a plain PowerShell terminal — no WSL or Git Bash required, though both also work.

### Install Node.js

If you do not have Node.js yet, the easiest way on Windows is `winget`:

```powershell
winget install OpenJS.NodeJS.LTS
```

Close and reopen PowerShell after installation so the `node` and `npm` commands are on your PATH. Verify:

```powershell
node --version   # should print v20.x or higher
npm --version
```

### Set up the frontend

> **All `npm` commands must be run from inside the `frontend\` subdirectory**, not the repo root. The repo root has no `package.json` — running npm there will fail with `ENOENT`.

```powershell
cd C:\Users\colem\Documents\Projects\chore_app\frontend
Copy-Item .env.example .env.local   # then open .env.local and fill in your values
npm install
```

If you ever open a new terminal and are unsure where you are:

```powershell
Get-Location   # must end in \frontend
```

If it shows the repo root, `cd frontend` first.

### Start the dev server

Run from `frontend\`:

```powershell
npm run dev
```

Vite starts at `http://localhost:5173`. Open that URL in Chrome or Edge. The onboarding screen will appear and load your People list from the live Sheet via the Apps Script API.

> The dev server proxies nothing — it hits the real Apps Script URL from your `.env.local`. You need the Apps Script Web App deployed (Step 2) before local testing will work.

### Preview the production build locally

To test the built PWA (service worker, manifest, install prompt) before deploying to GitHub Pages. Run from `frontend\`:

```powershell
npm run build
npm run preview
```

Vite serves the `dist/` folder at `http://localhost:4173`. Use Chrome DevTools → Application → Service Workers and Manifest to verify everything is registered correctly.

> **Note on PWA install prompt:** Chrome will not show the "Add to Home Screen" / install prompt on `localhost` for desktop. To test the full install flow, either deploy to GitHub Pages or use a tunneling tool like `ngrok` to expose your local server over HTTPS.

### Extract Firebase service account values with PowerShell

When you download the service account JSON from Firebase (Step 3), you can read out the three values you need for Apps Script Script Properties directly in PowerShell instead of opening the file manually:

```powershell
$json = Get-Content "C:\Users\colem\Downloads\chore-project-177ad-1e6564be6c4a.json" | ConvertFrom-Json
$json.project_id       # → FCM_PROJECT_ID
$json.client_email     # → FCM_CLIENT_EMAIL
$json.private_key      # → FCM_PRIVATE_KEY  (copy the full string, -----BEGIN ... -----END-----)
```

Paste each value into the corresponding Apps Script Script Property. The `private_key` value includes literal `\n` characters — paste it exactly as printed; Apps Script handles the escaping correctly.

### Test the Apps Script API from PowerShell

You can smoke-test your deployed endpoint without opening a browser:

```powershell
# GET: fetch today's assignments
$url = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
Invoke-RestMethod "$url?action=today" | ConvertTo-Json -Depth 5

# GET: fetch people list
Invoke-RestMethod "$url?action=people" | ConvertTo-Json -Depth 3
```

To test a POST endpoint (e.g. mark a chore complete). Note: Apps Script requires the body to be sent as plain text — do **not** set `ContentType = 'application/json'`:

```powershell
$body = '{"assignment_id":"YOUR_ASSIGNMENT_ID","person_id":"p_yourname"}'
Invoke-RestMethod -Uri "$url?action=complete" -Method Post -Body $body
```

If the endpoint returns `{ "error": "..." }` rather than a network failure, the API is reachable and the error message will tell you what went wrong (wrong ID, wrong status, etc.).

### Common PowerShell gotchas

**Execution policy.** If PowerShell blocks npm scripts with "running scripts is disabled," run this once in an elevated terminal:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Line endings.** Git on Windows may check out files with CRLF line endings. The `.gs` files are JavaScript and work fine either way in the Apps Script editor. If you paste a private key from the JSON file and it has extra `\r` characters, strip them before saving to Script Properties.

**`Invoke-RestMethod` vs `curl`.** PowerShell 5.1 ships an alias `curl` that points to `Invoke-RestMethod`, not the real curl binary. If you have Git for Windows installed, real curl is at `C:\Program Files\Git\mingw64\bin\curl.exe`. The PowerShell cmdlet works fine for this project; just be aware they are different things.

---

## Step 5 — Deploy the Frontend (GitHub Pages)

1. Push this repo to GitHub if you haven't already.

2. In your GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add each value from your `.env.local` file as a secret:
   - `VITE_API_URL`
   - `VITE_FCM_API_KEY`
   - `VITE_FCM_AUTH_DOMAIN`
   - `VITE_FCM_PROJECT_ID`
   - `VITE_FCM_STORAGE_BUCKET`
   - `VITE_FCM_MESSAGING_SENDER_ID`
   - `VITE_FCM_APP_ID`
   - `VITE_FCM_VAPID_KEY`

   These are read at build time by the GitHub Action ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) and inlined into the bundle. The `VITE_FCM_*` values are baked into **both** the main app (`src/lib/fcm.js`) and the service worker (`src/sw.js`, for background push) — if they're missing, the app still works but background notifications won't.

3. In **Settings → Pages**, set **Source** to **GitHub Actions** (not "Deploy from a branch"). The workflow uses `actions/deploy-pages`, so there is no `gh-pages` branch to select.

4. Push a commit to `main` that touches anything under `frontend/` (or the workflow file), or trigger the workflow manually from the **Actions** tab (**Run workflow**). The Action builds and deploys automatically. Once it completes, your app is live at:
   ```
   https://YOUR_GITHUB_USERNAME.github.io/chore_app/
   ```

   > **Subdirectory base path:** the app is served from `/chore_app/`, not the domain root. The workflow sets `VITE_BASE_PATH=/chore_app/` at build time so all asset, manifest, and service-worker paths resolve correctly. If you fork this to a repo with a different name, update `VITE_BASE_PATH` in [.github/workflows/deploy.yml](.github/workflows/deploy.yml) to `/<your-repo-name>/`.

---

## Step 6 — Add Family Members to the Sheet

Add a row to the `People` tab for each family member before they open the app. The onboarding screen pulls this list and lets each person pick themselves.

Required columns:
- `person_id` — short unique id, e.g. `p_sam`. Do not change this after creation.
- `name` — display name
- `color` — hex color for their avatar, e.g. `#2563eb`
- `is_admin` — `TRUE` for parents, `FALSE` for kids
- `points_total`, `streak_current`, `streak_best` — set to `0`

---

## Step 7 — Add Your First Chores

Either use the in-app admin screen (Chores tab, visible to admins) or add rows directly to the `Chores` tab in the Sheet.

Required columns:
- `chore_id` — unique slug, e.g. `c_dishes`. **Never change this once set.**
- `name` — display name
- `points` — integer
- `frequency` — one of: `daily`, `weekly`, `custom`, `monthly`, `interval`, `once`
- `active` — `TRUE`
- `requires_approval` — `TRUE` or `FALSE`

Optional columns:
- `location` — category shown on the chore (e.g. `Kitchen`), used to tell apart same-named chores. In the in-app editor this is a dropdown fed by the `Locations` tab.
- `description` — free-text notes about what the chore involves; shown on the chore card.

Frequency-specific columns (leave blank when not applicable):
- `weekly` → `custom_days`: weekday number 0–6 (0 = Sunday)
- `custom` → `custom_days`: comma-separated day names, e.g. `monday,wednesday,friday`
- `monthly` → `monthly_day`: day of month 1–31
- `interval` → `interval_days`: number of days between occurrences, e.g. `90`
- `once` → `once_date`: a single date (`YYYY-MM-DD`) for a one-time task. The generator creates exactly one assignment on/after that date, then auto-archives the chore (`active=FALSE`) so it leaves the active list. It still appears in History.

The nightly generator runs at 12:01am and creates `Assignments` rows for any chore due that day. To test it immediately, run `runNightlyGenerator` manually from the Apps Script editor.

**Today screen behavior:** Finished chores (done/skipped) gray out and sort to the bottom of each section; pending-approval chores show in amber (the assignee sees their own as "Waiting for review"). Unfinished chores from previous days stay on Today flagged **Overdue** (sorted to the top) until they're completed or an admin bumps/skips them — there's no age cutoff, so use bump/skip to clear a backlog. A completed chore can be **unchecked** (undo) by the assignee or an admin via the card's "Undo" button, which reverts it to open and removes any awarded points — *except* chores that a parent has already **approved**, which cannot be unchecked.

**Searching and ad-hoc logging:** The Manage Chores screen has a search box (matches name, location, and description). If a search finds nothing, an **Add "…"** button lets you create it prefilled — handy for avoiding duplicates. Each chore row also has a **✓ Did it** button that records the chore as done right now (shows in History) **without** awarding points to anyone — for chores you did that weren't assigned.

---

## Ongoing Maintenance

**Updating the backend:** Edit the `.gs` files, paste the changes into the Apps Script editor, and publish a new deployment version. The URL stays the same.

**Updating the frontend:** Push to `main`. The GitHub Action redeploys automatically.

**How users get updates:** The service worker calls `skipWaiting()` + `clientsClaim()` and the PWA registers with `registerType: 'autoUpdate'`, so a new deploy activates and the page reloads itself on the user's next open/refresh — no manual reinstall needed. To confirm which build is live, check the small version marker at the bottom of any screen (`v<version> · <build time UTC>`); it's stamped from `frontend/package.json` + build time. Bump the version in `package.json` for each release (and run `npm install` so `package-lock.json` stays in sync — the deploy uses `npm ci`, which fails if they drift).

**If a device seems stuck on an old version:** clear the site once — desktop: DevTools → Application → Service Workers → Unregister, then Clear storage; iPhone PWA: delete and re-add the Home Screen icon. Subsequent updates then apply automatically.

**Archiving old data:** Once a year, move `Assignments` rows older than 6–12 months to an `Assignments_Archive` tab (same columns) to keep the live tab fast.

**Sheet protection:** Consider locking the `Assignments` tab against manual edits (**Data → Protect sheets and ranges**) to prevent accidental overwrites. The `chore_id` column in `Chores` should also be protected — changing it orphans all historical assignment data for that chore.
