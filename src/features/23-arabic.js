/* ---------- Arabic interface: translate the text on screen with AR_DICT and keep it translated as it changes ---------- */
// The app is written in English; when Arabic is chosen every text node, placeholder, tooltip and label that
// matches a dictionary entry is replaced (numbers inside a sentence are kept). Your own data — task titles,
// emails, notes — is never translated. Switching back to English re-renders the page.
const AR_T = new Map(Object.entries(AR_DICT));
const arOn = () => document.documentElement.lang === 'ar';
const AR_NUM = /\d+(?:[.,]\d+)*/g;
function arLookup(t) {
  if (AR_T.has(t)) return AR_T.get(t);
  const nums = []; const k = t.replace(AR_NUM, x => { nums.push(x); return '{' + (nums.length - 1) + '}'; });
  if (nums.length && AR_T.has(k)) return AR_T.get(k).replace(/\{(\d+)\}/g, (_, i) => nums[+i] ?? '');
  return null;
}
// leading icons or symbols (✨ 🧾 + …) and a trailing colon or ellipsis stay as they are
function arText(s) {
  const t = s.trim(); if (!t || !/[A-Za-z]/.test(t)) return null;
  let r = arLookup(t); if (r !== null) return s.replace(t, r);
  const m = /^([^\p{L}\p{N}(“"«]+)([\s\S]*?)([:…]?)$/u.exec(t);
  if (m && m[2]) { r = arLookup(m[2] + m[3]) ?? arLookup(m[2]); if (r !== null) return s.replace(t, m[1] + r + (arLookup(m[2] + m[3]) === null ? m[3] : '')); }
  const m2 = /^([\s\S]*?)([:…])$/.exec(t); if (m2) { r = arLookup(m2[1]); if (r !== null) return s.replace(t, r + m2[2]); }
  // "Good morning, Mahmoud": the words before the comma are interface text, the rest is data
  const m3 = /^([^,]{2,40}), (.+)$/.exec(t); if (m3) { r = arLookup(m3[1]); if (r !== null) return s.replace(t, r + '، ' + m3[2]); }
  return null;
}
// what each translated text and attribute said in English, to put back when English is chosen again
const AR_ORIG = new Map();
function arSet(node, attr, val) {
  let o = AR_ORIG.get(node); if (!o) AR_ORIG.set(node, o = {});
  const k = attr || '#text'; if (!(k in o)) o[k] = attr ? node.getAttribute(attr) : node.nodeValue;
  if (attr) node.setAttribute(attr, val); else node.nodeValue = val;
}
function arRestore() {
  for (const [n, o] of AR_ORIG) { if (!n.isConnected) continue; for (const [k, v] of Object.entries(o)) { if (k === '#text') n.nodeValue = v; else n.setAttribute(k, v); } }
  AR_ORIG.clear();
}
// places that hold your own data, not interface text
const AR_SKIP = '.mnode, .bodytext, .preview, .nb-ptext, .nb-ans, .nb-q, .wr-out, .chat-preview, .subj, .todo-items .t-title, .ttitle, .title-edit, .cv-el, .rv .subj, [dir="auto"], .mono, code, pre, script, style, textarea, [data-no-tr]';
function arNode(root) {
  if (!root || !arOn()) return;
  const el = root.nodeType === 1 ? root : root.parentElement; if (!el) return;
  if (root.nodeType === 3) { if (!el.closest(AR_SKIP)) { const r = arText(root.nodeValue); if (r !== null) arSet(root, null, r); } return; }
  if (el.closest && el.closest(AR_SKIP) && el !== document.body) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 ? (n.matches(AR_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT });
  let n; const texts = []; while ((n = w.nextNode())) texts.push(n);
  for (const t of texts) { const r = arText(t.nodeValue); if (r !== null) arSet(t, null, r); }
  const attrs = el.querySelectorAll ? [el, ...el.querySelectorAll('[placeholder],[title],[aria-label]')] : [];
  for (const a of attrs) { if (!a.getAttribute || (a.closest && a.closest('.mnode'))) continue; for (const k of ['placeholder', 'title', 'aria-label']) { const v = a.getAttribute(k); if (v) { const r = arText(v); if (r !== null) arSet(a, k, r); } } }
}
let arObs = null, arWas = false;
function arApply() {
  if (typeof document === 'undefined') return;
  const on = arOn();
  if (on) {
    arNode(document.body);
    if (!arObs) {
      arObs = new MutationObserver(ms => { if (!arOn()) return; arObs.disconnect(); try { for (const m of ms) { if (m.type === 'characterData') arNode(m.target); else m.addedNodes.forEach(arNode); } } finally { arObs.observe(document.body, { childList: true, subtree: true, characterData: true }); } });
      arObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  } else { if (arObs) { arObs.disconnect(); arObs = null; } if (AR_ORIG.size) arRestore(); }
  arWas = on;
}
HOOKS.afterRender.push(() => { if (arOn()) { arNode(document.body); if (AR_ORIG.size > 20000) for (const n of [...AR_ORIG.keys()]) if (!n.isConnected) AR_ORIG.delete(n); } });
window.__AR_TR = { arText, size: AR_T.size }; // test hook
