/* ---------- site mode: readable outdoors on a phone or tablet ---------- */
// ☀ in the header: big text, black-on-white contrast that holds up in sunlight, thicker lines and borders, large
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
(() => {
  const rail = document.querySelector('.rail'); if (!rail || document.getElementById('site-btn')) return;
  const foot = rail.querySelector('.rail-foot');
  const b = document.createElement('button'); b.id = 'site-btn'; b.className = 'nav site-btn'; b.dataset.act = 'site-toggle'; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<span class="site-ic" aria-hidden="true">☀</span><span class="site-lbl">Site</span>';
  rail.insertBefore(b, foot || null);
  siteApply(siteOn());
})();
ACT['site-toggle'] = () => siteToggle();
SETUP_EXTRA.push(() => `<section class="card pad" data-sec="Site mode" style="display:grid;gap:8px"><div class="section-title"><h2>☀ Site mode</h2></div>
  <p class="small muted" style="margin:0">For site visits: big text, black on white for sunlight, thick lines and large buttons. It applies to this device only.</p>
  <label class="check"><input type="checkbox" data-chg="site-mode" ${siteOn() ? 'checked' : ''}>Use site mode on this device</label></section>`);
CHG['site-mode'] = el => { if (!!el.checked !== siteOn()) siteToggle(); };
