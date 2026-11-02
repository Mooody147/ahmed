# Action Register — hand-off for building the desktop app

**Read this first, Claude Code.** This folder is a working single-page web app that currently runs as a
claude.ai Artifact. Your job is to turn it into a **desktop app** (recommended: Electron, or Tauri if
the user prefers a smaller install) while keeping every feature and the existing UI. Almost all code is
platform-neutral; only five platform calls need replacing (section 4).

---

## 1. What the product does

A personal work assistant for **Mahmoud Sobeah**, a mechanical design engineer in water / wastewater
treatment (P&IDs, GA drawings, hydraulic calcs, submittals, vendor comments, BOQs/RFQs, pumps, blowers,
valves, piping, civil coordination). It turns corporate emails **and their attachments** into an
organised, evidence-backed to-do list — **without** mailbox integration, admin rights or IT approval.

Daily flow:
1. **Get emails in** — forward them to a personal Gmail plus-address (`msobeah12+tasks@gmail.com`), or
   drop Outlook `.msg` / `.eml` / `.zip` files, loose attachments, or pasted email text.
2. **Read everything locally** — email bodies, nested/forwarded emails, PDF (text, scanned pages, A3+
   drawing sheets rendered to images incl. a zoomed title-block crop), Word (incl. reviewer comments),
   Excel (sheet + row refs + cell notes), PowerPoint, DXF text, CSV/TXT/HTML/RTF, images.
3. **Claude analyses** each email (+ attachments, + page images) and proposes tasks: action, owner
   (mine / waiting on others / FYI), project, **topic**, category, priority, deadline (+ how it was
   derived), next step, **sub-items** (e.g. each open CRS comment), links to earlier tasks, and
   **verbatim evidence quotes** with source + page/sheet/row.
4. **Evidence is verified locally** — every quote is searched in the extracted text; location is
   auto-filled; badges: Verified / Partly matched / Read from image / Not found.
5. **User reviews and approves** (nothing enters the list without approval). Duplicates are detected
   and offered as merges; later emails can propose updates (close, re-date, block) to existing tasks.
6. **To-do** — three views: **🧠 Map** (mind map: My work → Project → Topic → Task → Items, with
   history, links, drag-to-move/link, activity feed), **▦ Board** (3D card stacks), **☰ List**.
7. Export: CSV (Excel), ICS (Outlook calendar deadlines), full JSON backup + restore.

## 2. File map

| Path | What it is |
|---|---|
| `src/core.js` | **Platform-neutral engine** (`ETM` global; also `module.exports` for Node). MIME/.eml parser, Outlook `.msg` reader (CFB via SheetJS) incl. compressed-RTF bodies, forward unwrapping, attachment extraction for every format, prompt builders, model-output normaliser, evidence verifier, duplicate finder, masking. **Keep as is.** |
| `src/app.js` | UI + state + persistence + AI orchestration + Gmail inbox + mind map (vanilla JS, one IIFE). Platform calls are isolated here (section 4). |
| `src/style.css` | All styling; light/dark via CSS tokens on `:root`. |
| `src/shell.html` | Static app shell (rail nav, top bar, tab bar, drawer, modal, toasts). |
| `build.js` | Concatenates shell + style + core + app into `dist/action-register.html` (`npm run build`). |
| `dist/action-register.html` | Built single file (what is published as the Artifact). |
| `test/unit/*.test.js` | Node tests for parsing/extraction and prompt/verification/dedupe. |
| `test/e2e_*.py` + `test/harness.py` + `test/mock.js` | Playwright browser tests with a **mock of the artifact runtime** (DB, Claude, Gmail, downloads). Read `mock.js` — it documents the exact shapes the app expects. |
| `test/fixtures/` | Real `.msg` (from the ISC-licensed `msgreader` npm package), `.eml` (normal, forward-as-attachment, inline Outlook forward, Gmail forward), PDF (text / scanned / A3 drawing), XLSX CRS with cell note, DOCX with reviewer comment, PNG scan. `test/mkfix.js` regenerates the generated ones. |

Libraries are loaded at runtime from jsDelivr (pinned): `pdfjs-dist@3.11.174`, `xlsx@0.18.5`,
`mammoth@1.8.0`, `jszip@3.10.1` (see `CDN` in `core.js` → `need(lib)`). **For desktop, bundle them
locally** (same versions are in `devDependencies`) and point `CDN` at local files — no network needed
for parsing.

## 3. Data model (persisted)

- **Task** `{ id, ref "T-0001", title, action, ownership: mine|waiting|fyi, owner, requestedBy, project,
  topic, discipline, workType (stored, not shown), priority: critical|high|medium|low, deadline
  YYYY-MM-DD|null, deadlineText, deadlineBasis: explicit|relative|none|uncertain, status:
  todo|in_progress|waiting|blocked|done, nextStep, dependsOn, blockedReason, subtasks:[{id,text,ref,
  location,done,doneAt}], relatedIds:[taskId], placement:{status: auto|suggested|confirmed, confidence,
  options:[{project,discipline,relatedTaskId,reason}]}, evidence:[{source,sourceName,location,quote,
  check,emailId}], emailIds, threadKey, sourceSubject/From/Date, notes, history:[{at,text,emailId?}],
  createdAt, updatedAt, completedAt, projectLocked, topicLocked, catLocked, catBy }`
- **Email record** `{ id, threadKey, subject, from, to, cc, date, messageId, source, fileName,
  importedAt, snippet, attachments:[{name,kindLabel,size,status,note,pages,images,textLen}], analysis:
  {summary, actionRequired, noActionReason, project, category, tasks:[proposal…], updates:[…], decisions,
  flags, keyMap, analyzedAt}, reviewState: pending|reviewed|dismissed, hasText, gmailId, gmailUrl,
  forwardedBy, forwardMode }`
- **Texts** (separate doc per email, fetched on demand): `{ body, atts:[{name,text,status,…}], trimmed }`
- **Settings**: `{ me:{name,emails[],aliases,role,org,scope}, projects:[{code,name,aliases}], tier,
  mask, storeText, vision, drawings, titleBlocks, maxPageImages, setupDone, gmail:{address,days,
  autoCheck,autoAnalyse,label,labelId} }`
- **Gmail seen-list**: `{ ids: { gmailMessageId: {at, r: emailId|'skipped'} } }`
- Browser-local UI prefs in `localStorage` (`action-register-todo-v2`).

## 4. The only platform-specific code — replace these

All accessed through `window.claude.use(name)` inside `initStore()` in `src/app.js`. The artifact
runtime injects `window.claude`. **Recommended approach: write a small `platform.js` that provides the
same `window.claude.use()` surface backed by desktop services** (Electron preload + IPC), so `app.js`
needs almost no edits. `test/mock.js` is a complete in-memory example of that surface.

| Capability | Used for | Calls the app makes | Desktop replacement |
|---|---|---|---|
| `db` | Persistence + live sync | `db.doc(path)`, `.collection(path)`, `.doc(id)`, `.get()`, `.set(obj)`, `.delete()`, `.onSnapshot(cb, errCb)` on `data/users/<uid>/register/{tasks,emails,texts}`, `…/settings`, `…/gmailseen` | SQLite (better-sqlite3) or a JSON store in the user data folder, exposed via IPC; `onSnapshot` = event emitter after writes. Docs are ≤256 KB today — no limit needed on desktop. |
| `user` | Viewer id + name | `user.me()` → `{id, name}`, `user.id()` | Local profile; constant id. |
| `sample` | **Claude calls** | `sample.json(prompt, {modelTier: 'complex'|'default'|'quick', images: Blob[], signal, onText, cache})`; `sample.limits()` → `{maxPromptBytes, images:{maxCount,maxInputBytes,mediaTypes}}` | **Anthropic Messages API** from the main process (never expose the key to the renderer). Map tiers to models (e.g. complex → latest Opus, default → Sonnet, quick → Haiku — check current model IDs in the Anthropic docs). Send images as base64 `image` blocks. Parse the JSON reply tolerantly (whole reply → fenced block → first `{`/`[` to last `}`/`]`). Stream for `onText`. Store the API key in the OS keychain (keytar / safeStorage). Raise the 256 KB prompt budget if desired (`budget` in `buildPrompt`). |
| `mcp` (Gmail) | Forwarding inbox | `callTool('Gmail', tool, input)` with tools `search_threads {query,pageSize,view}`, `get_thread {threadId,messageFormat}`, `get_message {messageId,messageFormat:'RAW'|'PLAIN_TEXT'}` (RAW returns base64url MIME), `list_labels`, `create_label {displayName}`, `label_message {messageId,labelIds}` — result read as `result.payload` | **Gmail API** (OAuth desktop flow, scope `gmail.modify`) with the same query `to:(<address>) newer_than:Nd -label:action-register-imported`, `users.messages.get format=raw`, labels API. Alternative: IMAP (app password) to the same mailbox. Keep `checkGmail()` logic as is. |
| `downloads` | Export files | `downloads.save({filename, data})` | Native save dialog (`dialog.showSaveDialog`) + write file. |

Other artifact-only behaviours to drop or adapt: the in-page fallbacks for "Claude/Gmail not available
in this view", `history.replaceState` hash routing (fine to keep), the `#modal` copy-text fallback for
exports.

### Desktop-only opportunities (optional, ask the user first)
- **Watch a folder** (e.g. `Documents/Action Register Inbox`) and import any `.msg`/`.eml` dropped there.
- **Drag from Outlook straight onto the app window** (classic Outlook provides the `.msg` file).
- **Outlook COM automation (Windows, classic Outlook)** could read a chosen folder directly — only with
  the user's IT policy allowing it; never bypass corporate security controls.
- Native notifications for overdue / today items; tray icon; auto-start.

## 5. AI behaviour (keep exactly)

- Analysis prompt: `buildPrompt()` in `core.js` — rules for ownership, forwarding notes, evidence
  quotes, deadlines, priority, sub-items, topics, categories, relationships/placement, flags, plus an
  engineering glossary. Output schema is inside the prompt.
- Categorisation prompt (manual / older tasks): `buildCategorizePrompt()` — project, topic, category,
  related task ids, placement confidence/options.
- Post-processing in `analyzeBundle()` (app.js): local flags (unreadable / excluded / truncated /
  image limit), evidence verification, duplicate detection, default selections, email record creation.
- Privacy: optional masking of other people's emails/phones before sending (`makeMasker`), restored in
  results. Keep "nothing reaches the list without approval".

## 6. Run and test

```bash
npm install                 # dev deps (parsers used by tests)
npm run build               # -> dist/action-register.html
npm run test:unit           # Node: parsing/extraction, prompt, verification, dedupe
pip install playwright && python3 -m playwright install chromium
npm run test:e2e            # browser flows against test/mock.js (screenshots in test/shots/)
```
E2E coverage: Gmail inbox (forward-as-attachment, inline Outlook forward, Gmail forward, oversized
message fallback, other-address filter, labelling, no re-import), file import (.eml/.msg/docs,
duplicates), analysis → review → "Add all", topics/categories by Claude, sub-items, 3D board, list,
mind map (placement suggestions, links, drag-to-move with undo, pan/zoom, history, activity, search,
full-text node sizing), exports, phone width, dark mode.

## 7. Acceptance criteria for the desktop build

1. All current views and interactions work identically (To-do Map/Board/List, Review, Add emails,
   Emails, Setup) in light and dark mode.
2. Data persists locally across restarts; JSON backup/restore works; CSV/ICS export via save dialog.
3. Claude analysis works with the user's Anthropic API key (stored securely), including page images.
4. Gmail forwarding inbox works via Gmail API OAuth (or IMAP) with the same de-duplication + labelling.
5. Drag-and-drop of `.msg`/`.eml`/files onto the window works; parsing runs offline with bundled libs.
6. Existing unit + e2e tests pass (point the harness at the desktop renderer or keep the web build).
7. No telemetry; nothing is sent anywhere except the Anthropic API (analysis) and Gmail (inbox).

## 8. Known limits / notes

- The default forwarding address `msobeah12+tasks@gmail.com` is hard-coded as a default in
  `gmDefaults()` (app.js) — make it a first-run setting.
- Unreadable formats are flagged, not guessed: DWG/RVT/other CAD, legacy .doc/.ppt, TIFF/HEIC,
  password-protected files, 7z/RAR.
- Very large emails are truncated to the prompt budget with an explicit "partly analysed" flag.
- Real-world behaviour of Claude was only tested against mocks in this build; validate with real emails.
