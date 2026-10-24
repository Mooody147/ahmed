# Action Register — desktop app

Turns work emails **and their attachments** into an evidence-backed to-do list for a mechanical design
engineer in water / wastewater treatment. Claude reads each email, proposes tasks with verbatim quotes,
and nothing reaches the list until you approve it. Views: mind map, 3D board, list. Exports: CSV, ICS,
JSON backup.

This repository is the Electron desktop version of the Action Register web app. The original hand-off
brief is in [`docs/HANDOFF.md`](docs/HANDOFF.md).

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
   them up, then labels them `Action Register/Imported` so they are never imported twice. Connecting needs
   a Google OAuth client that you create once (about 5 minutes):
   1. [Google Cloud console](https://console.cloud.google.com/projectcreate): create a project.
   2. APIs & Services › Library › enable **Gmail API**.
   3. OAuth consent screen: user type **External**, add your Gmail address as a **test user**, add the
      scope `https://www.googleapis.com/auth/gmail.modify`.
   4. Clients › Create client › **Desktop app**. Paste the client ID and secret into the app and press
      **Connect Gmail**. Your browser opens for Google sign-in.
   5. While the consent screen is in "Testing", Google expires the sign-in after 7 days and you have to
      connect again. **Publish app** on the consent screen stops that. For your own account you can
      click through the "unverified app" warning.
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
- **Tidy layout** puts every node back in its automatic place.
- **Full screen:** ⤢ or Shift+F. Esc leaves it.

**History.**
- **📌 Day** highlights the tasks worked on that day and filters the activity feed.
- **🕒 As of** shows the map as it was on a past date. Tasks created later are hidden, and work finished later shows as still open.
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
| Gmail | `desktop/gmail.js` | OAuth loopback + PKCE, Gmail REST API. Answers the same tool calls the web app made to the claude.ai Gmail connector. |
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
- The only outbound connections come from the main process: Anthropic (analysis) and Google (Gmail,
  when connected). They go through Chromium's network stack, which uses the system proxy and the OS
  certificate store, so they work on corporate networks.
- There is no telemetry and no auto-update.

**Data folder.** Windows: `%APPDATA%\Action Register\data`, macOS: `~/Library/Application Support/Action Register/data`,
Linux: `~/.config/Action Register/data`. The File menu has **Open data folder**. Back up with
Setup › Full backup (.json).

## Tests

```bash
npm run test:unit                       # parsing, prompts, evidence verification, dedupe (Node)
xvfb-run -a npm run test:desktop        # Electron end-to-end (drop xvfb-run on Windows/macOS)
npm run build && npm run test:e2e       # web-build browser tests incl. test/e2e_canvas.py (Python Playwright)
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
- CSV, ICS and JSON export, dark mode, and a clear error for a rejected key.

Screenshots go to `test/desktop/out/`.

## Known limits

- Mock servers stand in for Claude and Gmail in the tests. Check the first real emails' tasks and
  evidence carefully.
- Dragging a message straight from Outlook onto the window does not work: Outlook hands over a virtual
  file that Chromium cannot read. Drag it to the desktop first (it saves as `.msg`), then onto the app.
- DWG/RVT and other CAD files, legacy `.doc`/`.ppt`, TIFF/HEIC, password-protected files and 7z/RAR are
  flagged as unreadable, not guessed.
- Gmail is reached through the Gmail API only. IMAP with an app password is not implemented.
