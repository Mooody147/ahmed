# Action Register 1.2 — setup guide

Everything is optional except step 2: without an AI the app still keeps your tasks, documents, money,
notebooks (passage search) and tools, but emails are not read for you.

## 1. Install

1. Open <https://github.com/Mooody147/ahmed/releases/latest> and download
   `Action-Register-Setup-1.2.3.exe` (Windows installer; `Action-Register-Portable-1.2.3.exe` runs without
   installing but does not update itself) or the Mac `.dmg` — `mac-arm64` for Apple-silicon Macs (M1 and
   later), `mac-x64` for older Intel Macs.
2. Windows shows *“Windows protected your PC”* because the installer is not code-signed:
   **More info › Run anyway**. Mac: right-click the app › **Open** the first time.
3. Already on 1.1? The app updates itself (Setup › Automation › *Install updates automatically*), or just
   install 1.2 over it — your data is kept.

## 2. Connect your Claude account (Setup › Connections)

**Your Claude account (the default — uses your Pro or Max plan, no API key).** Setup › Connections ›
**Connect my Claude account**. That is the only step: the first time, the app sets up Anthropic's Claude
helper (Claude Code) on this PC by itself (a minute or two), then a sign-in window opens and your browser
shows the Claude login — log in with your Claude account. The app notices when you are done and switches
over; the card then says **Connected** and shows how much of your plan's 5-hour and weekly usage is used.

Emails count against your plan's usage (the same limits as your chats on claude.ai) and cost nothing extra.
When the limit is reached, a backup AI takes over if you set one (Advanced), or the app says when it resets.
The app runs Claude Code without any tools and never sees your password or sign-in token. Anthropic allows
signing in to its own unmodified Claude Code with your own subscription; it does not allow other apps to use
the claude.ai sign-in directly, which is why the app goes through Claude Code. Anthropic can change these rules.

Everything else in this section is optional and sits under **Advanced**.

**Advanced: Claude on API credit.** <https://console.anthropic.com/settings/keys> › *Create key* ›
paste in Setup › Connections › **Save key** › **Test**. Add credit under *Billing*. Typical cost: a few US
cents per email with attachments on the thorough model, much less on the fast one.

**Advanced: backup or alternative AIs** (Setup › Advanced: other AIs, backup and budget):

| AI | Where to get access | Notes |
|---|---|---|
| ChatGPT (OpenAI) | <https://platform.openai.com/api-keys> | The ChatGPT Plus subscription does **not** include the API; API use is billed separately. |
| Gemini (Google) | <https://aistudio.google.com/apikey> | Free tier with daily limits; on the free tier Google may use what you send to improve its products — avoid confidential project data there. |
| Local model (Ollama) | <https://ollama.com/download>, then in a terminal `ollama pull qwen3` (or another model) | Free and private (nothing leaves your PC); slower and less careful with long attachments. Needs a reasonably strong PC. |

After pasting a key press **Load the model list**: the app suggests a strong and a fast model. Type their
prices (from the provider's pricing page) if you want the cost estimate and the monthly budget to include
them. Then choose:

- **Main AI** and **Backup AI**;
- *Switch to the backup by itself* — otherwise, when the main AI is out of credit, the app asks you;
- *Suggest the fast, cheaper model for simple emails*;
- **Monthly budget** — the app warns at 80% and asks before spending more at 100%.

## 3. Gmail forwarding inbox (Setup › Connections)

1. Turn on 2-Step Verification: <https://myaccount.google.com/signinoptions/twosv>.
2. Create an app password: <https://myaccount.google.com/apppasswords> › name *Action Register* › **Create**.
3. Paste your Gmail address and the 16-letter password › **Connect Gmail**.
4. Forward work emails (from Outlook: *Forward as Attachment* keeps the original sender and attachments)
   to `yourname+tasks@gmail.com`. They are picked up and analysed automatically.

The same app password is used to **send** chasers and the weekly report from your Gmail
(smtp.gmail.com, port 465). Some company networks block ports 993/465 — then use it from home or ask IT.

## 4. You and your projects (Setup › You)

Name, work email addresses (so the AI knows which actions are yours), your manager, and your projects
(`CODE | Name | other names`). Then Setup › Working days and holidays (Egypt: Friday–Saturday weekend).

## 5. Company server and email files (Setup › Company server)

Choose the server folder (e.g. `\\server\projects` or a mapped drive). Each email that has tasks shows
**📁?** on its canvas node until you file it: the app suggests a folder name like
`2026-10-22 - ELM - Valves spec CRS - Rania Hassan`, and **Save to server** copies the email (.msg/.eml)
and its attachments there. **✉** on the node opens the email in Outlook (classic Outlook on Windows), or the
saved copy otherwise.

## 6. Your Excel tools (Tools › My workbooks)

Add your calculation workbooks (the pipe network sheets, Manning, aeration, sump design…) and your HTML tools
(e.g. the STP Process Optimiser). They are stored on your PC (and in your cloud account if sync is on) —
they are **not** in the public GitHub repository. Library sheets (pipe sizes, materials) have
**Edit table** to change values or add rows.

Things to know from checking your sheets:
- `Pipe_Network_Hydraulic_Workbook_GENERAL.xlsx` has 12 cells with `#REF!` (broken references in the
  original file) and *Pipe Network Hydraulic Calculation – All Paths in one sheet.xlsx* has 2 — they show
  `#REF!` in Excel too; fix them in Excel and re-import.
- `Path 1!AH24` uses `SUMPRODUCT(IFERROR(B45:B65*C45:C65,0))`: older Excel and LibreOffice give 0 here, as the
  app does; Excel 365 may give the full sum. Check that one cell in Excel 365 if you rely on it.

## 7. Cloud sync and share links

Follow [`CLOUD-SETUP.md`](CLOUD-SETUP.md) (about 10 minutes, once): free Supabase project, run the setup
script, paste the URL and key, create your account. On another PC: paste the connection code and sign in.

For **share links** (Canvas › Export › Share link) turn on GitHub Pages once:
repository **Settings › Pages › Source: GitHub Actions**, then run the *Share-link viewer* workflow
(Actions tab). The links open `https://mooody147.github.io/ahmed/`.

## 8. Everyday use

- **Add emails** (forward, drop .msg files, paste text, or a WhatsApp/Teams chat in Tools › Chats) →
  **Review** the proposed tasks with their quotes → **Add**.
- **Long emails** (hundreds of pages, thousands of comment rows) are read in parts and the results joined, so
  nothing is cut off; Arabic and English both work.
- **Canvas**: 🗑 on any box deletes it (a task, an item, or a whole topic or project with its tasks);
  **↶ Undo** / **↷ Redo** (Ctrl+Z / Ctrl+Shift+Z) undo deletes, moves and ticks; **⟳ Refresh** shows everything again
  and offers to add tasks from analysed emails that are not on the canvas or to put back tasks deleted in the last 30 days.
- **To-do**: list, board or canvas. **Daily**: plan the day, wrap up in the evening (🌙). **Plan**:
  calendar, Gantt, workload, contacts, vendors, meeting prep, their deadlines.
- **Notebook**: add a folder of specifications or contracts and ask questions — answers cite file and page.
- **Money**: income, expenses, budgets, bank statements, receipts, work-expense claims.
- **Tools**: workbooks, calculators with calc notes, procurement, equipment, transmittals/RFIs, drawing
  compare, conflicts, site visits, comment patterns, units, standards, spec checklist, letters.
- Ctrl+K searches and runs any command; the tray icon has the small **Today** window.
- Setup › Appearance › **Language: العربية** for the Arabic interface.

## 9. Backups

Daily backups go to the folder in Setup › Automation. Setup › Backup also has a **password-protected
backup** (.arbak — without the password nobody, including you, can open it) and **everything in one Excel
workbook**. Cloud sync is not a backup on its own: a deletion syncs too (deleted tasks stay 30 days in the
recycle bin).

## Troubleshooting

| What you see | What to do |
|---|---|
| “Your Anthropic account has no usable credit” | Your API key's Console account has no credit (a Pro/Max plan does not count). Press Connect my Claude account (step 2) to use your plan instead, top up at console.anthropic.com › Billing, or press *Use ChatGPT for now* / *Try the fast model*. |
| “Your Claude account is not connected / signed out” | Setup › Connections › Connect my Claude account. |
| “Your Claude plan's usage limit is reached” | Wait for the time shown, or set a backup AI under Advanced so emails keep being read. |
| Gmail “did not accept” the app password | Create a new app password; make sure 2-Step Verification is on; copy all 16 letters. |
| Cloud sync error after a week of not using it | Free Supabase projects pause after 7 days without use — open supabase.com/dashboard and press *Restore*. |
| Share link says “no longer shared” | The share was stopped, or GitHub Pages is not on (step 7). |
| “Open in Outlook” opens a file instead | Outlook could not find the message in your mailbox (new Outlook, or the email was moved/deleted); the saved copy is opened instead. |
| Windows SmartScreen warning | Expected for unsigned apps: More info › Run anyway. |
