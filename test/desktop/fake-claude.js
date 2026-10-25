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
  const ans = /Reply with this JSON exactly/.test(prompt) ? '{"ok": true}' : JSON.stringify(mockAnswer(prompt));
  for (let i = 0; i < ans.length; i += 400) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ans.slice(i, i + 400) } } });
  out({ type: 'assistant', message: { model, content: [{ type: 'text', text: ans }] } });
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 0.12, resetsAt, status: 'allowed' }, seven_day: { utilization: 0.31, resetsAt: resetsAt + 86400 * 3, status: 'allowed' } } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: ans, usage: { input_tokens: 1200, output_tokens: 300 }, modelUsage: { [model]: { inputTokens: 1200, outputTokens: 300 } } });
});
