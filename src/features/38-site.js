/* ---------- site mode: readable outdoors on a phone or tablet ---------- */
// Part of phone mode (More › Big text, or Setup › Phone mode): big text, black-on-white contrast that holds up in sunlight, thicker lines and borders, large
// buttons for gloved or hurried fingers, no animation. Remembered on this device only (the office PC stays normal).
const SITE_LS = 'ar-site-mode';
const siteOn = () => { try { return localStorage.getItem(SITE_LS) === '1'; } catch { return false; } };
function siteApply(on) {
  document.documentElement.classList.toggle('site-mode', on);
  const b = document.getElementById('site-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Site mode is on — tap for the normal view' : 'Site mode: big text and strong contrast for outdoors'; }
  if (typeof measureCache !== 'undefined') measureCache.clear();
}
function siteToggle() {
  const on = !siteOn(); try { localStorage.setItem(SITE_LS, on ? '1' : '0'); } catch {}
  siteApply(on); UI.map.fitted = false; render(); toast(on ? '☀ Site mode on — big text and strong contrast.' : 'Site mode off.');
}
siteApply(siteOn());
ACT['site-toggle'] = () => siteToggle();
CHG['site-mode'] = el => { if (!!el.checked !== siteOn()) siteToggle(); };
