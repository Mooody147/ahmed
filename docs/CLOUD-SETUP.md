# Cloud sync and canvas share links — one-time setup

Cloud sync keeps the same register on every PC: sign in with your email and password and your tasks,
emails, canvas, daily log, money, notebooks and workbook edits are there. It uses **your own free Supabase
project**, so the data sits in an account you own (not on a server run by the app's author).

What is **not** synced, on purpose: API keys (Claude, ChatGPT, Gemini), the Gmail connection, and
PC-specific folders (watch folder, backup folder, company-server folders). Enter those on each PC.

## 1. Create the Supabase project (about 10 minutes, once)

1. Go to <https://supabase.com/dashboard>, sign up (free plan) and press **New project**.
   Name: `action-register`. Choose a database password (keep it; the app does not need it).
   Region: the one nearest to you (for Egypt and the Gulf, *Frankfurt* or *Mumbai*).
2. When the project is ready open **SQL Editor › New query**. In the app press
   **Setup › Cloud sync › Copy setup script**, paste it and press **Run**. It creates two tables, the
   share-link function and a private file bucket, each locked so that every user sees only their own rows.
3. Optional: **Authentication › Sign In / Providers › Email** — turn off *Confirm email* if you do not want
   to click a confirmation email after creating the account.
4. Open **Project Settings › API Keys** (or the **Connect** button) and copy:
   * the **Project URL** — `https://xxxx.supabase.co`
   * the **anon** / **publishable** key (starts with `sb_publishable_` or `eyJ`).
   Never use the *secret* / *service_role* key in the app.

## 2. First PC

**Setup › Cloud sync**: paste the URL and key › **Save project** › type your email and a password
(8+ characters) › **Create account**. The app uploads everything and restarts the window once.

## 3. Every other PC

Install the app › **Setup › Cloud sync › Second PC?** › paste the **connection code** shown on the first
PC (it holds the project URL and key) › **Use code** › sign in with the same email and password.
The data comes down; anything that existed only on that PC goes up. When the same item was changed on
both PCs, the later change is kept.

Changes are sent a second or two after you make them and checked every minute (and when the app
quits). Stored files (email originals, attachments, workbooks, receipts) are uploaded in the background
and downloaded the first time you open them on another PC — untick *Also sync stored files* to keep
them on each PC only.

## 4. Canvas share links (tablet, phone, colleagues)

Canvas › **Export › Share link** › *Link for all projects* (or for the project you are looking at). The
link opens a read-only page with the canvas (pinch and drag to zoom) and a to-do list per project. While
the app is open it refreshes the link a few seconds after each change; the page reloads every minute.
**Stop sharing** makes the link stop working at once.

The page is published from this repository with GitHub Pages. Turn it on once:
**GitHub › repository Settings › Pages › Build and deployment › Source: GitHub Actions**, then run the
*Share-link viewer* workflow (Actions tab) or push any change to `viewer/`. The address is
`https://<your-github-name>.github.io/<repository>/` — for this repository
`https://mooody147.github.io/ahmed/`. If GitHub says the branch is not allowed to deploy, open
**Settings › Environments › github-pages** and add the branch, or change the viewer address in
**Setup › Cloud sync › Address of the share-link viewer** to wherever you host `viewer/index.html`.

## Limits of the free Supabase plan (check supabase.com/pricing — they change)

* about 500 MB of database and 1 GB of file storage, 50 MB per file (the app sends files up to 45 MB);
* a free project is **paused after a week without use** — open the app (or the dashboard) at least weekly,
  or restore it from the dashboard; nothing is lost.

## Privacy

The tables are protected by row-level security: only a signed-in user can read or change their own rows.
The share function returns one shared canvas for one token and nothing else. Your password is never
stored on the PC; only the sign-in token is, encrypted with the system keychain.
