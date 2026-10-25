#!/usr/bin/env node
// Stand-in for Anthropic's Claude Code program (`claude`), so "Claude — my Pro/Max plan" can be tested without
// a real account. State file (FAKE_CLAUDE_STATE): { loggedIn, method, limited }. Each call is logged to
// FAKE_CLAUDE_LOG with its arguments, whether an API key leaked into its environment, and the images it got.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {}, setTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'mock.js'), 'utf8'), sandbox);
const mockAnswer = sandbox.window.__mockAnswer;

const st = (() => { try { return JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_STATE, 'utf8')); } catch { return {}; } })();
const args = process.argv.slice(2);
const log = x => { if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(x) + '\n'); };
const out = x => process.stdout.write(JSON.stringify(x) + '\n');

if (args[0] === 'auth' && args[1] === 'status') {
  out({ loggedIn: !!st.loggedIn, authMethod: st.loggedIn ? (st.method || 'claude.ai') : 'none', apiProvider: 'firstParty' });
  process.exit(st.loggedIn ? 0 : 1);
}
if (args[0] === 'auth' && args[1] === 'login') { log({ login: true }); process.exit(0); }

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  const msg = JSON.parse(input.trim().split('\n')[0]);
  const content = msg.message.content;
  const prompt = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const model = args[args.indexOf('--model') + 1];
  log({ args, model, apiKeyLeaked: !!process.env.ANTHROPIC_API_KEY, images: content.filter(b => b.type === 'image').length, prompt: prompt.slice(0, 200) });
  out({ type: 'system', subtype: 'init', apiKeySource: 'none', model, tools: [] });
  const resetsAt = Math.floor(Date.now() / 1000) + 3 * 3600;
  if (!st.loggedIn) { out({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login' }); process.exit(1); }
  if (st.limited) {
    out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 1, resetsAt, status: 'rejected' } } } });
    out({ type: 'result', subtype: 'success', is_error: true, result: "You've hit your limit · resets 3pm" }); process.exit(1);
  }
  // a long email read in parts: one task per part, with the comment rows of that part as subtasks, quoted
  // without the Arabic vowel marks (the app must still find the quote)
  const lp = /LONG EMAIL: .*?This is part (\d+) of (\d+)/.exec(prompt);
  const rows = lp ? [...prompt.matchAll(/^(C-\d{5}) \| (.+)$/gm)] : [];
  const ans = /Reply with this JSON exactly/.test(prompt) ? '{"ok": true}' : lp ? JSON.stringify({
    summary: 'طلب مراجعة تعليقات / CRS review', actionRequired: true, project: 'ELM', category: 'vendor_comments',
    tasks: [{ ref: 'N1', title: 'Respond to the CRS comments on the RAS pump calc', action: 'Answer every open comment', type: 'reply', ownership: 'mine', owner: 'me', priority: 'high', deadline: null, deadlineBasis: 'none',
      subtasks: rows.slice(0, 3).map(r => ({ text: r[1] + ' — ' + r[2].slice(0, 40), ref: r[1] })),
      evidence: rows.length ? [{ source: 'A1', location: null, quote: rows[0][2].replace(/[\u064B-\u0652]/g, '').split(' ').slice(0, 8).join(' ') }] : [], confidence: 0.9 }],
    updates: [], flags: [], decisions: [], documents: [] }) : JSON.stringify(mockAnswer(prompt));
  log({ part: lp ? +lp[1] : 0, of: lp ? +lp[2] : 0, bytes: Buffer.byteLength(input), firstRow: rows.length ? rows[0][1] : '', lastRow: rows.length ? rows[rows.length - 1][1] : '' });
  for (let i = 0; i < ans.length; i += 400) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ans.slice(i, i + 400) } } });
  out({ type: 'assistant', message: { model, content: [{ type: 'text', text: ans }] } });
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.12, resetsAt, status: 'allowed' }, seven_day: { utilization: 0.31, resetsAt: resetsAt + 86400 * 3, status: 'allowed' } } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: ans, usage: { input_tokens: 1200, output_tokens: 300 }, modelUsage: { [model]: { inputTokens: 1200, outputTokens: 300 } } });
});
