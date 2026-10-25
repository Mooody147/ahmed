# Action Register — desktop app

Turns work emails **and their attachments** into an evidence-backed to-do list for a mechanical design
engineer in water / wastewater treatment. Claude reads each email, proposes tasks with verbatim quotes,
and nothing reaches the list until you approve it. Views: mind map, 3D board, list. Exports: CSV, ICS,
JSON backup.

This repository is the Electron desktop version of the Action Register web app. The original hand-off
brief is in [`docs/HANDOFF.md`](docs/HANDOFF.md).

## What's new in 1.2

Step-by-step setup for everything below: [`docs/SETUP-GUIDE.md`](docs/SETUP-GUIDE.md).

- **Your Excel tools in the app (Tools › My workbooks):** import your calculation workbooks (.xlsx/.xlsm/.xls or a .zip) and HTML tools; every formula, drop-down and library table works as in Excel (the formula engine was checked against LibreOffice on 5,859 formulas of your sheets with no differences). Library tables (pipe sizes, materials…) are editable with rows you can add or remove; save calculations against a task, print a calc note, export the edited workbook.
- **Which AI:** Claude stays the default; ChatGPT, Gemini or a free local model (Ollama) can be the main AI or a backup. When Claude is out of credit you are asked (or it switches by itself); simple emails can use the fast, cheaper model; a monthly budget warns at 80% and stops at 100%; every email shows which AI read it.
- **Cloud sync and share links:** sign in with email and password on any PC and get the same data (your own free Supabase project — see [`docs/CLOUD-SETUP.md`](docs/CLOUD-SETUP.md)); share the canvas as a link that always shows the current state, for a tablet, phone or colleague.
- **Email files:** the original email and its attachments are kept; the canvas asks whether each emailed task's email is saved on the company server and suggests a dated folder name (copy, or save it there in one click); open the email in Outlook from its task.
- **Money:** income and expenses, budgets, salary and bills that repeat, bank-statement import (CSV/Excel, Arabic digits, debit/credit columns, duplicates skipped), receipts read by the AI, work expenses to claim back.
- **Notebook:** ask questions about a folder or files on your PC (NotebookLM-style); answers quote the file and page; linked folders pick up new and changed files.
- **Engineering:** pipe sizing, wet well and pump starts, water hammer, aeration oxygen demand and air flow, retention time and chemical dosing calculators with Word calc notes; procurement tracker with late flags; equipment list; transmittal and RFI generator with logs; drawing revision compare; conflict finder; search everything.
- **Communication:** send drafts from Gmail, weekly report by email, WhatsApp / Teams chats to tasks, Arabic ↔ English and tone helper, letters, method statements, delay notices and inspection requests, thread summaries, reminders and snooze.
- **Plan:** calendar, Gantt timeline, weekly workload with extension-request drafts, contacts from signatures, vendor scorecard, meeting prep, the other side's contract deadlines; Daily wrap-up and printable day sheet.
- **Quality:** site visit reports with photos, review-comment patterns, unit converter, standards library, specification compliance checklist.
- **Comfort:** a small "Today" window from the tray and pop-out windows for a second monitor, choose your tabs, everything in one Excel workbook, tasks from an Excel tracker, password-protected backups, a dashboard file for your manager, an appraisal pack, a guided tour and demo data.
- **Arabic interface:** Setup › Appearance › Language — right to left, Arabic font and dates; the canvas, charts and numbers stay left to right.

## What's new in 1.1

- **Look and feel:** custom title bar, icon set, light/dark/system theme, six accent colours, compact density, text size, project colours and icons.
- **Runs in the background (desktop):** tray icon, close-to-tray, start with Windows, Gmail checked every few minutes, morning reminder, desktop notifications, quick add from any program (Ctrl+Shift+Space), a watch folder for `.msg`/`.eml`/PDF files, daily backups, optional PIN lock, and automatic updates from GitHub Releases (Windows installer; unsigned macOS builds cannot update themselves, so download the new .dmg).
- **Home:** today strip with a morning briefing and risk radar, command palette (Ctrl+K), shortcuts (?), focus mode with a 25-minute timer, privacy mode (Ctrl+Shift+P), recycle bin.
- **Canvas:** View / History / Export menus, grouped tool flyouts, project colour bands, semantic zoom (labels grow as you zoom out), minimap, PNG and PDF export, and a presentation mode that steps through projects (← →).
- **Daily:** drag cards between lanes, progress ring, timers that run while a task is in progress.
- **Insights:** charts of finished work and open tasks by project, waiting-on-others board with one-click chaser drafts, timesheet (CSV), progress reports for a week / month / year or one project and hand-over packs, as Word, PDF or email text.
- **Documents:** register built from analysed emails (number, revision, review code, resubmission tracking, Excel export), timeline, attachment library, equipment tags, lessons learned, and an evidence viewer that shows each quote highlighted in its email or attachment.
- **Tools:** pipe velocity and head loss, pump power and motor size, NPSH available, blower power; offer / datasheet comparison (TBE); CRS response drafting and saving back to Excel; meeting minutes to tasks.
- **Claude:** Ask your register (Ctrl+J), reply and chaser drafts, email rules, working days and holidays in deadline maths, and it learns from the corrections you make to its choices. Prompt caching and a monthly cost estimate in Setup.

Not yet: code signing (needs a purchased certificate), an Outlook add-in, voice notes and a phone app (the share link and cloud sync cover viewing on a phone).

## Install and run

Requirements: Node.js 22 or newer.

```bash
npm install
npm start                 # builds the renderer into app/ and opens the app
```

Build an installer:

```bash
npm run dist:win          # release/Action-Register-Setup-<version>.exe and a portable .exe
npm run dist:mac          # release/*.dmg
npm run dist:linux        # release/*.AppImage
```

Every push also builds the Windows and macOS installers on GitHub Actions
(`.github/workflows/desktop.yml`). Download them from the run's **Artifacts**. The builds are not
code-signed, so Windows SmartScreen shows "unknown publisher" (More info › Run anyway) and macOS needs
right-click › Open the first time.

## First run

Open **Setup › Connections**.

1. **Claude (required for analysis).** Paste an Anthropic API key from
   [console.anthropic.com › API keys](https://console.anthropic.com/settings/keys) and press **Save key**,
   then **Test**. Usage is billed to your Anthropic account.
2. **Gmail forwarding inbox (optional).** Forward work emails to `you+tasks@gmail.com` and the app picks
   them up automatically, then labels them `Action Register/Imported` so they are never imported twice.
   Connecting takes about 2 minutes:
   1. Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/twosv) for the Gmail account.
   2. Open [App passwords](https://myaccount.google.com/apppasswords), type `Action Register`, press **Create**.
   3. Paste your Gmail address and the 16-letter password into Setup › Connections and press **Connect Gmail**.

   The app reads Gmail over IMAP (`imap.gmail.com:993`). Some company networks block that port; if so, connect from
   home or use the Gmail API option. Google does not offer app passwords for work/school accounts or accounts with
   Advanced Protection; for those, open **"No App passwords page?"** under the Gmail section and connect with your
   own Google Cloud OAuth client (Desktop app, scope `gmail.modify`).
3. Fill in **You** (name, work email, projects) so Claude can tell your actions from other people's.

Without Gmail you can still drag `.msg` / `.eml` / `.zip` files or loose PDF, Word, Excel and image files
onto the window, or paste email text.

## Canvas (To-do › Map)

The map lays your tasks out automatically: My work → Project → Topic → Task → Items. You can rearrange
and add to it freely:

| Tool (key) | What it does |
|---|---|
| Select (V) | Drag empty space to pan, or hold Space / use the middle mouse button. Drag a project or topic to move its whole branch, or drag a task to move it. Drop a task on a project, topic or another task to re-file or link it. Drag the handle on a node's right edge to widen it. Shift+drag selects notes and drawings. |
| Task (K) | Click empty canvas to create a task there, or click a project or topic to add the task inside it. |
| Sticky (N), Text (T), Rectangle (R), Ellipse (O), Diamond (D), Frame (F) | Click to place one, or drag to size it, then type. Double-click to edit the text again. |
| Arrow (A), Line (L) | Drag to draw. |
| Connector (C) | Drag from one item to another. Between two tasks it creates a real task link, which also shows in the task's details. |
| Pen (P), Highlighter (M), Eraser (E) | Draw freehand. The eraser removes any ink, note, shape or connector it touches. |

- **Selection bar:** recolour, change thickness, duplicate (Ctrl+D), bring to front, delete (Del), and **→ Task**, which turns a note into a to-do task.
- **Undo/redo:** Ctrl+Z / Ctrl+Shift+Z covers every canvas change, including moving tasks between projects.
- **Rename:** the ✎ button on a project or topic renames it on all its tasks.
- **View menu:** completed tasks, activity panel, project colour bands, minimap, and **Tidy layout**, which puts every node back in its automatic place.
- **Export menu:** PNG image, PDF, or **Present project by project** (← → to step, Esc to stop).
- **Zoom:** zoomed far out, details hide and project names grow so the map stays readable. Click or drag the minimap to jump.
- **Full screen:** ⤢ or Shift+F. Esc leaves it.

**History menu.**
- **📌 Highlight day** highlights the tasks worked on that day and filters the activity feed.
- **🕒 Map as of** shows the map as it was on a past date. Tasks created later are hidden, and work finished later shows as still open.
- Completed tasks stay on the map, with their links.

## Daily tracker (Daily tab)

- Add **My task**, **From manager** (records who asked), **Achievement** or **Note** for any day. Press Enter to add.
- New tasks are real to-do tasks. They are matched to a project, topic and related task straight away from your project list and existing tasks, Claude refines that, and they appear on the canvas immediately. If the same work is already in your to-do list, that task is added to the day instead of creating a duplicate.
- **Lanes:** To do / In progress / Completed. ▶ Start and ✓ update the task everywhere. Anything you finish elsewhere that day lands in Completed.
- **Carry-over:** unfinished tasks from earlier days carry into today, tagged with the day they were first planned.
- **Side panels:**
  - Achievements, with ✨ suggestions drafted from the day's completed work.
  - Open requests from your manager. Set the manager's name in Setup so emailed requests from them are tagged too.
  - Tasks worth planning today.
  - A day-by-day history.
- **🧠 Show on canvas** opens the map with that day highlighted, as it was on that day.

## How it works

| Part | File | Role |
|---|---|---|
| Engine | `src/core.js` | Email/MSG parsing, attachment extraction, prompts, evidence checks. Unchanged from the web app apart from an overridable library path. |
| UI | `src/app.js`, `src/style.css`, `src/shell.html` | The web app's UI, with desktop wording for setup, storage and Gmail messages. |
| Platform layer | `src/platform.js` | Implements the `window.claude.use()` surface the UI expects (`db`, `user`, `sample`, `mcp`, `downloads`) on top of the Electron bridge, and renders Setup › Connections. |
| Main process | `desktop/main.js` | Window, `app://` protocol, network lock-down, IPC. |
| Storage | `desktop/store.js` | `register.json` for tasks/emails/settings plus one file per email for extracted text. Atomic writes. |
| Claude | `desktop/claude.js` | Anthropic Messages API through `@anthropic-ai/sdk`, streamed. |
| Gmail | `desktop/gmail-imap.js`, `desktop/gmail.js` | App password over IMAP (default), or OAuth loopback + PKCE with the Gmail REST API. Both answer the same tool calls the web app made to the claude.ai Gmail connector. |
| Secrets | `desktop/config.js` | API key and Gmail tokens encrypted with the OS keychain (`safeStorage`: DPAPI / Keychain / libsecret). |

**Models.** Thorough analysis uses `claude-opus-5-5` at effort `high`, Balanced uses `claude-sonnet-5-5`
at `medium`, and quick sorting jobs use `claude-haiku-5-5` at `low`. You can change these under
Setup › Connections › Models and limits. Opus and Sonnet requests turn on Anthropic's server-side refusal
fallback (`fallbacks: "default"`), so a request a safety classifier declines is retried on the
recommended fallback model instead of failing. Haiku has no server-side fallback.

**Prompt size.** The web app was capped at 256 KB of text per email. The desktop default is 600 KB
(about 150k tokens), and you can set it from 64 to 3000 KB. Larger limits read more of long
attachments but cost more.

**Privacy.**
- The window cannot reach the network at all (blocked by request filter and Content-Security-Policy).
- Parsing runs offline with bundled `pdf.js 3.11.174`, `SheetJS 0.18.5`, `mammoth 1.8.0` and `JSZip 3.10.1`.
- Fonts are bundled too.
- The only outbound connections come from the main process, and only to services you set up: the AI you
  chose (Anthropic, OpenAI, Google Gemini, or Ollama on your own PC), Gmail (reading over IMAP, sending
  over SMTP or the Gmail API), your Supabase project (cloud sync), and GitHub Releases (updates). They go
  through Chromium's network stack, which uses the system proxy and the OS certificate store, so they work
  on corporate networks.
- There is no telemetry.

**Data folder.** Windows: `%APPDATA%\Action Register\data`, macOS: `~/Library/Application Support/Action Register/data`,
Linux: `~/.config/Action Register/data`. The File menu has **Open data folder**. Back up with
Setup › Full backup (.json).

## Tests

```bash
npm run test:unit                       # parsing, prompts, evidence verification, dedupe (Node)
xvfb-run -a npm run test:desktop        # Electron end-to-end (drop xvfb-run on Windows/macOS)
npm run build && npm run test:e2e       # web-build browser tests: canvas, daily, insights, documents, tools, workbooks, money,
                                        # notebook, engineering, communication, plan, quality, comfort, Arabic (Python Playwright)
```

The desktop test (`test/desktop/e2e.js`) launches the real app against local mock Anthropic, Google
OAuth and Gmail servers (`test/desktop/mock-servers.js`). It checks:
- first run with nothing connected, and that the window has no network access;
- API key validation and storage (never in clear text, never in the renderer);
- the OAuth/PKCE flow;
- Gmail import, labelling and de-duplication across restarts;
- streamed analysis, the model, effort and fallback settings sent, and page images reaching Claude;
- review › Add all, the to-do views, and offline parsing of `.msg`, `.eml`, PDF (text, scanned, A3 drawing), XLSX, DOCX and PNG;
- the canvas (sticky note, pen, moved branch) and the daily tracker, and that both survive a restart;
- CSV, ICS and JSON export, dark mode, and a clear error for a rejected key;
- workbooks and HTML tools, email files and filing to a server folder, the weekly report sent over SMTP;
- the AI choice (mock OpenAI, Gemini and Ollama servers): out of credit → backup, fast model, budget stop;
- the notebook reading a linked folder, cloud sync between two PCs (mock Supabase), the share link and its viewer page;
- the small Today window updating live with the main window.

Screenshots go to `test/desktop/out/`.

## Known limits

- Mock servers stand in for Claude and Gmail in the tests. Check the first real emails' tasks and
  evidence carefully.
- Dragging a message straight from Outlook onto the window does not work: Outlook hands over a virtual
  file that Chromium cannot read. Drag it to the desktop first (it saves as `.msg`), then onto the app.
- DWG/RVT and other CAD files, legacy `.doc`/`.ppt`, TIFF/HEIC, password-protected files and 7z/RAR are
  flagged as unreadable, not guessed.
