/* ---------- appearance: theme, accent colour, density, text size ---------- */
// Stored in St.settings.ui; applied to <html> (data-theme, data-density, accent tokens).
const ACCENTS = {
  teal: { light: ['#0A6B74', '#085A62', '#D5EBEB'], dark: ['#52B4BD', '#6CC4CC', '#143537'], label: 'Teal' },
  blue: { light: ['#1F5FBF', '#184C99', '#DCE7F8'], dark: ['#6FA3EE', '#8DB7F2', '#16294A'], label: 'Blue' },
  indigo: { light: ['#4B47B8', '#3C3994', '#E2E1F7'], dark: ['#9A97EE', '#B0AEF2', '#24224A'], label: 'Indigo' },
  green: { light: ['#2F7A3E', '#256232', '#DDEFE0'], dark: ['#6CC27E', '#86CF95', '#173321'], label: 'Green' },
  amber: { light: ['#9A5B00', '#7D4A00', '#F6E7CF'], dark: ['#E6A54A', '#EDB868', '#3A2A12'], label: 'Amber' },
  rose: { light: ['#B03A5B', '#912F4A', '#F6DEE5'], dark: ['#EE8BA6', '#F2A3B8', '#40202A'], label: 'Rose' },
};
const uiPrefs = () => Object.assign({ theme: 'system', accent: 'teal', density: 'comfortable', text: 100 }, St.settings.ui || {});
const darkMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const isDark = () => { const t = uiPrefs().theme; return t === 'dark' || (t === 'system' && !!(darkMQ && darkMQ.matches)); };
let appearanceSig = '';
function applyAppearance(force) {
  const p = uiPrefs(), dark = isDark();
  const sig = JSON.stringify([p, dark]); if (!force && sig === appearanceSig) return; appearanceSig = sig;
  const r = document.documentElement;
  if (p.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p.theme);
  r.dataset.density = p.density;
  const a = (ACCENTS[p.accent] || ACCENTS.teal)[dark ? 'dark' : 'light'];
  if (p.accent && p.accent !== 'teal') { r.style.setProperty('--accent', a[0]); r.style.setProperty('--accent-2', a[1]); r.style.setProperty('--accent-soft', a[2]); }
  else ['--accent', '--accent-2', '--accent-soft'].forEach(k => r.style.removeProperty(k));
  if (DESKTOP) {
    document.body.classList.add('has-titlebar', 'plat-' + ((DK.status() || {}).platform || 'win32'));
    try { DK.call('ui:titlebar', dark ? { color: '#151D1C', symbol: '#E3EBE9' } : { color: '#FFFFFF', symbol: '#15201E' }); } catch {}
    try { DK.call('ui:zoom', { factor: (+p.text || 100) / 100 }); } catch {}
  }
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => applyAppearance(true));
function setUiPref(k, v) { const s = clone(St.settings); s.ui = { ...uiPrefs(), [k]: v }; putSettings(s); applyAppearance(); render(); }
function appearanceHTML() {
  const p = uiPrefs();
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-act="ui-pref" data-key="${key}" data-val="${v}" aria-pressed="${String(p[key]) === String(v)}">${l}</button>`).join('')}</div>`;
  return `<section class="card pad set-sec"><div class="section-title"><h2>Appearance</h2></div>
    <div class="set-rows">
      <div class="set-row"><div><b>Theme</b><div class="small muted">Follow Windows, or always light or dark.</div></div>${seg('theme', [['system', 'Follow system'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="set-row"><div><b>Accent colour</b><div class="small muted">Buttons, highlights and links.</div></div><div class="row accent-pick">${Object.entries(ACCENTS).map(([k, a]) => `<button class="sw big ${p.accent === k ? 'on' : ''}" data-act="ui-pref" data-key="accent" data-val="${k}" style="--c:${a[isDark() ? 'dark' : 'light'][0]}" title="${a.label}" aria-label="${a.label}" aria-pressed="${p.accent === k}"></button>`).join('')}</div></div>
      <div class="set-row"><div><b>Density</b><div class="small muted">Compact fits more on screen.</div></div>${seg('density', [['comfortable', 'Comfortable'], ['compact', 'Compact']])}</div>
      ${DESKTOP ? `<div class="set-row"><div><b>Text size</b><div class="small muted">Makes everything larger or smaller.</div></div>${seg('text', [[90, '90%'], [100, '100%'], [110, '110%'], [125, '125%']])}</div>` : ''}
    </div></section>`;
}
Object.assign(ACT, { 'ui-pref': el => setUiPref(el.dataset.key, el.dataset.key === 'text' ? +el.dataset.val : el.dataset.val) });
HOOKS.beforeRender.push(() => applyAppearance());
