/* ---------- Which AI: labels, out-of-credit choices, the fast model for simple emails, budget warnings ---------- */
const AI_LABEL = { claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', ollama: 'Local model' };
// "claude-sonnet-5-5" → "Claude Sonnet 5.5"; other providers keep the model ID after their name
function aiName(meta) {
  if (!meta) return '';
  const m = String(meta.model || '');
  const c = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(m);
  if (meta.provider === 'claude' || c) return c ? `Claude ${c[1][0].toUpperCase() + c[1].slice(1)} ${c[2]}${c[3] ? '.' + c[3] : ''}` : 'Claude';
  return `${AI_LABEL[meta.provider] || meta.provider || 'AI'}${m ? ' · ' + m.replace(/^ollama:/, '') : ''}`;
}
function aiByTitle(meta) {
  if (!meta) return '';
  const f = meta.fallback;
  return f ? `The backup AI read this email because ${AI_LABEL[f.from] || f.from} ${({ billing: 'was out of credit', auth_failed: 'rejected its key', rate_limited: 'hit its usage limit', unavailable: 'could not be reached', model_not_found: 'did not find its model' })[f.code] || 'failed'}.` : `Model: ${meta.model || ''}`;
}
const aiSt = () => (DESKTOP && DK.status().ai) || null;

// error text that names the AI that failed (app.js aiErrorText covers Claude on claude.ai)
function aiErrorFor(e) {
  if (!e || !e.code) return '';
  const p = e.provider || (aiSt() || {}).primary || 'claude', who = AI_LABEL[p] || 'The AI';
  const backup = e.backup ? ` You can use ${AI_LABEL[e.backup]} (your backup AI) for now.` : '';
  if (e.code === 'budget') return `${e.message} Raise the budget in Setup › Which AI, or continue just this time.`;
  if (e.code === 'billing') return `${who} says the account has no usable credit (or this model is not enabled for it).${backup} Or try the fast model, which costs far less, or top up and press Analyse again.`;
  if (e.code === 'unavailable') return `${e.message || who + ' could not be reached.'}${backup}`;
  if (p === 'claude') return '';
  if (e.code === 'auth_failed') return `Your ${who} API key was rejected. Check it in Setup › Which AI.${backup}`;
  if (e.code === 'model_not_found') return `The ${who} model set in Setup › Which AI was not found. Load the model list there and pick one.`;
  if (e.code === 'rate_limited') return `${who} usage limit reached for now. Wait a while, then press Analyse again.${backup}`;
  return '';
}
function aiErrorActions(b) {
  const x = b.errInfo; if (!x || !DESKTOP) return '';
  const btn = (act, label, extra = '') => `<button class="btn sm" data-act="${act}" ${extra}>${esc(label)}</button>`;
  const out = [];
  if (x.backup && ['billing', 'auth_failed', 'rate_limited', 'unavailable', 'model_not_found', 'budget'].includes(x.code)) out.push(btn('ai-use', `Use ${AI_LABEL[x.backup]} for now`, `data-p="${esc(x.backup)}"`));
  if (x.code === 'billing' || x.code === 'budget') out.push(btn('ai-quick-all', 'Try the fast model'));
  if (x.code === 'budget') out.push(btn('ai-over', 'Continue this time'));
  if (x.code === 'billing' && DK.billingUrl(x.provider)) out.push(btn('ai-topup', 'Top up', `data-p="${esc(x.provider)}"`));
  if (['budget', 'auth_failed', 'model_not_found'].includes(x.code) || (x.code === 'billing' && !x.backup)) out.push(btn('nav', 'Open Setup', 'data-view="setup"'));
  return out.length ? `<div class="row" style="margin-top:6px">${out.join('')}</div>` : '';
}
function aiRetry() { retryErrored(); runAnalysis(); }
Object.assign(ACT, {
  'ai-use': el => { DK.aiOverride({ provider: el.dataset.p }); toast(`${AI_LABEL[el.dataset.p]} is used until you restart the app.`); aiRetry(); },
  'ai-quick-all': () => { UI.staging.forEach(b => { if (b.state === 'error') b.tierOverride = 'quick'; }); aiRetry(); },
  'ai-over': () => { DK.aiOverride({ overBudget: true }); aiRetry(); },
  'ai-topup': el => { DK.call('shell:openExternal', DK.billingUrl(el.dataset.p)).catch(() => {}); },
  'ai-simple-yes': () => { aiSimpleList().forEach(b => { b.tierOverride = 'quick'; }); render(); },
  'ai-simple-no': () => { aiSimpleList().forEach(b => { b.tierOverride = b.tierOverride || 'kept'; }); render(); },
});

/* --- simple emails: short text, nothing attached worth reading → offer the fast model --- */
function aiSimple(b) {
  if (b.source === 'docs' || b.state !== 'ready' || b.skip) return false;
  const body = (b.email && b.email.body) || '';
  const sent = (b.atts || []).filter(a => a.include && a.res && ((a.res.text || '').trim().length > 200 || (a.res.images || []).length));
  return body.length < 2500 && !sent.length;
}
const aiSimpleList = () => UI.staging.filter(b => aiSimple(b) && !b.tierOverride);
function aiSimpleHTML(ready) {
  const a = aiSt();
  if ((a && !a.suggestSimple) || St.settings.tier === 'quick' || !St.sample || UI.analyzing) return '';
  const list = aiSimpleList(); if (!list.length) return '';
  let saving = '';
  if (a) {
    const ps = a.prices[a.strongModel], pq = a.prices[a.quickModel];
    if (ps && pq && pq.in > 0) saving = ` (about ${Math.round(ps.in / pq.in)}× cheaper)`;
    else if (a.primary === 'ollama') saving = '';
  }
  const quick = a ? aiName({ provider: a.primary, model: a.quickModel }) : 'the quick model';
  return callout('info', `<div class="row"><span>${list.length === ready.length ? (list.length === 1 ? 'This email looks' : `All ${list.length} emails look`) : `${list.length} of these emails look`} simple — short, with no attachments to read. ${esc(quick)} can read ${list.length === 1 ? 'it' : 'them'}${esc(saving)}.</span><span class="spacer"></span><button class="btn sm primary" data-act="ai-simple-yes">Use the fast model</button><button class="btn sm" data-act="ai-simple-no">Keep the thorough one</button></div>`);
}

/* --- monthly budget: warn at 80% and 100%, once each per month --- */
function aiBudgetCheck() {
  const a = aiSt(); if (!a || !(a.budget > 0)) return;
  const month = new Date().toISOString().slice(0, 7), pct = a.monthCost / a.budget;
  const level = pct >= 1 ? 100 : pct >= 0.8 ? 80 : 0; if (!level) return;
  const key = `ar-budget-${month}-${level}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch {}
  toast(level === 100 ? `AI budget reached: about $${a.monthCost.toFixed(2)} of $${a.budget} this month. The app now asks before spending more.` : `80% of this month's AI budget is used (about $${a.monthCost.toFixed(2)} of $${a.budget}).`, { action: 'Setup', fn: () => go('setup'), err: level === 100 });
}
if (DESKTOP) { DK.on('sample:usage', () => setTimeout(aiBudgetCheck, 50)); setTimeout(aiBudgetCheck, 3000); }
