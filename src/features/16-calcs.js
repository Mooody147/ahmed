/* ---------- More calculators: pipe sizing, wet well and pump starts, water hammer, aeration oxygen demand, retention time, chemical dosing ---------- */
const DN_SIZES = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1400, 1600];
const okNum = (...v) => v.every(x => Number.isFinite(x));
Object.assign(CALC, {
  size({ q, v }) {
    if (!(q > 0 && v > 0)) return {};
    const Q = q / 3600, dreq = Math.sqrt(4 * Q / (Math.PI * v)) * 1000, dn = DN_SIZES.find(x => x >= dreq) || null;
    const vel = d => (d ? Q / (Math.PI * (d / 1000) ** 2 / 4) : null), i = DN_SIZES.indexOf(dn);
    return { dreq, dn, vdn: vel(dn), dnLess: i > 0 ? DN_SIZES[i - 1] : null, vLess: i > 0 ? vel(DN_SIZES[i - 1]) : null };
  },
  // Metcalf & Eddy / HI: active volume V = Q·Tmin/4 gives the most starts when the inflow is half the pump rate
  wetwell({ q, n, area, qin }) {
    if (!(q > 0 && n > 0 && area > 0)) return {};
    const qm = q / 60, tmin = 60 / n, V = qm * tmin / 4, depth = V / area;
    const qi = qin > 0 && qin < q ? qin / 60 : null, cycle = qi ? V / qi + V / (qm - qi) : null;
    return { tmin, V, depth, cycle, starts: cycle ? 60 / cycle : null, fill: qi ? V / qi : null, run: qi ? V / (qm - qi) : null };
  },
  // Joukowsky surge, wave speed for a thin-walled pipe; closure slower than 2L/a reduced by Michaud
  hammer({ dv, d, e, E: Eg, L, tc }) {
    if (!(d > 0 && e > 0 && Eg > 0 && L > 0)) return {};
    const K = 2.19e9, rho = 998, a = Math.sqrt((K / rho) / (1 + (K / (Eg * 1e9)) * (d / e)));
    const dh = a * Math.abs(dv) / G, tcrit = 2 * L / a, slow = tc > tcrit;
    const dhUse = slow ? 2 * L * Math.abs(dv) / (G * tc) : dh;
    return { a, dh, dp: rho * G * dh / 1e5, tcrit, kind: slow ? 'slow closure (Michaud)' : 'rapid closure (Joukowsky)', dhUse, dpUse: rho * G * dhUse / 1e5 };
  },
  // AOR from the loads, then SOR = AOR·C∞20 / [α·F·(β·τ·Ω·C∞20 − C)·θ^(T−20)] (Metcalf & Eddy, 5th ed.)
  aer({ q, bod, ff, nox, dn, t, c, alpha, beta, fo, theta, z, depth, sote }) {
    if (!(q > 0 && alpha > 0 && fo > 0 && depth > 0 && sote > 0)) return {};
    const aor = q * (bod * ff + 4.57 * nox - 2.86 * dn) / 1000;
    const csT = 14.652 - 0.41022 * t + 0.007991 * t * t - 0.000077774 * t ** 3, cs20 = 9.09, tau = csT / cs20, omega = CALC.patm(z) / 101.325;
    const cinf20 = cs20 * (1 + 0.4 * depth / 10.33), den = alpha * fo * (beta * tau * omega * cinf20 - c) * Math.pow(theta, t - 20);
    const sor = den > 0 ? aor * cinf20 / den : null, se = sote * depth / 100;
    const air = sor ? sor / 24 / (se * 0.279) : null;
    return { aor, aorh: aor / 24, sor, ratio: sor ? sor / aor : null, se: se * 100, air, airm: air ? air / 60 : null };
  },
  hrt({ l, w, dep, q, pf }) {
    if (!(l > 0 && w > 0 && dep > 0 && q > 0)) return {};
    const V = l * w * dep, A = l * w, h = V / (q / 24);
    return { V, A, h, hp: pf > 0 ? h / pf : null, sor: q / A, sorp: pf > 0 ? q * pf / A : null };
  },
  dose({ q, mg, pct, rho, hours, days }) {
    if (!(q > 0 && pct > 0 && rho > 0)) return {};
    const act = q * mg / 1000, prod = act / (pct / 100), lh = prod / rho, ld = lh * (hours || 24);
    return { act, actd: act * (hours || 24), prod, lh, ld, store: ld * (days || 0) / 1000 };
  },
});
Object.assign(CALCS, {
  size: { label: '📏 Pipe size from flow', fields: [['q', 'Flow', 'm³/h', 410], ['v', 'Target velocity', 'm/s', 1.5]],
    out: r => [['Required inside diameter', r.dreq, 'mm', 0], ['Next standard size', r.dn, 'DN', 0], ['Velocity in that size', r.vdn, 'm/s', 2], ['One size smaller', r.dnLess, 'DN', 0], ['Velocity one size smaller', r.vLess, 'm/s', 2]],
    note: 'D = √(4Q / πv), using the DN as the bore (check the real inside diameter of the pipe class). Typical: pump suction 1.0–1.5 m/s, discharge 1.5–2.5 m/s, gravity sewers ≥ 0.6–0.75 m/s self-cleansing, sludge 1.0–1.5 m/s.' },
  wetwell: { label: '🕳️ Wet well volume & pump starts', fields: [['q', 'Pump capacity (one pump)', 'm³/h', 410], ['n', 'Allowed starts per hour', '1/h', 10], ['area', 'Wet well plan area', 'm²', 12], ['qin', 'Actual inflow (optional, to check)', 'm³/h', 150]],
    out: r => [['Minimum cycle time', r.tmin, 'min', 1], ['Active (working) volume', r.V, 'm³', 2], ['Active depth (start − stop level)', r.depth, 'm', 2], ['At the actual inflow: fill time', r.fill, 'min', 1], ['At the actual inflow: pump run time', r.run, 'min', 1], ['At the actual inflow: starts per hour', r.starts, '1/h', 1]],
    note: 'V = Q·T/4 with T = 60/starts (minutes): the most starts happen when the inflow is half the pump rate. Typical limits: up to 10–15 starts/h for small submersibles, 4–6 for large motors — use the motor supplier’s figure. Alternating duty pumps can share the volume.' },
  hammer: { label: '🔨 Water hammer (surge)', fields: [['dv', 'Velocity change (e.g. full stop)', 'm/s', 1.8], ['d', 'Pipe inside diameter', 'mm', 300], ['e', 'Wall thickness', 'mm', 7.1], ['E', 'Pipe material modulus E', 'GPa (steel 207, DI 169, PVC 3.3, HDPE 0.9)', 169], ['L', 'Pipe length to the reflection point', 'm', 1200], ['tc', 'Valve closure / pump run-down time', 's', 3]],
    out: r => [['Wave speed a', r.a, 'm/s', 0], ['Joukowsky surge Δh = aΔv/g', r.dh, 'm', 1], ['Joukowsky surge pressure', r.dp, 'bar', 2], ['Critical time 2L/a', r.tcrit, 's', 2], ['Closure type', r.kind], ['Surge for this closure time', r.dhUse, 'm', 1], ['Surge pressure for this closure', r.dpUse, 'bar', 2]],
    note: 'a = √[(K/ρ) / (1 + K·D/(E·e))], water K = 2.19 GPa. Add the surge to the steady pressure and compare with the pipe rating; check negative pressure (vapour cavities) too. A transient analysis is needed for design — this is a first check.' },
  aer: { label: '🫧 Aeration oxygen demand & air flow', fields: [['q', 'Flow', 'm³/d', 20000], ['bod', 'BOD removed', 'mg/L', 230], ['ff', 'O₂ per BOD removed', 'kg/kg (≈1.1–1.5 incl. endogenous)', 1.2], ['nox', 'Ammonia nitrified', 'mg/L', 30], ['dn', 'Nitrate denitrified (credit)', 'mg/L', 0], ['t', 'Water temperature', '°C', 28], ['c', 'Operating DO', 'mg/L', 2], ['alpha', 'α (fine bubble 0.4–0.65)', '—', 0.5], ['beta', 'β', '—', 0.95], ['fo', 'Fouling factor F', '—', 0.9], ['theta', 'θ', '—', 1.024], ['z', 'Site altitude', 'm', 20], ['depth', 'Diffuser submergence', 'm', 5.5], ['sote', 'SOTE per metre of depth', '%/m', 5.5]],
    out: r => [['Actual oxygen requirement AOR', r.aor, 'kg O₂/d', 0], ['AOR per hour', r.aorh, 'kg O₂/h', 1], ['Standard oxygen requirement SOR', r.sor, 'kg O₂/d', 0], ['SOR / AOR', r.ratio, '', 2], ['Oxygen transfer efficiency SOTE', r.se, '%', 1], ['Air flow', r.air, 'Nm³/h', 0], ['Air flow', r.airm, 'Nm³/min', 1]],
    note: 'AOR = Q·(BOD·f + 4.57·NOx − 2.86·NO₃ denitrified); SOR = AOR·C∞20 / [α·F·(β·τ·Ω·C∞20 − C)·θ^(T−20)], C∞20 = 9.09·(1 + 0.4·depth/10.33). Air = SOR / (SOTE × 0.279 kg O₂/Nm³). Use diffuser supplier SOTE data for design.' },
  hrt: { label: '⏱️ Tank retention time & overflow rate', fields: [['l', 'Length', 'm', 30], ['w', 'Width', 'm', 10], ['dep', 'Water depth', 'm', 4], ['q', 'Average flow', 'm³/d', 20000], ['pf', 'Peak factor', '—', 2.5]],
    out: r => [['Volume', r.V, 'm³', 0], ['Surface area', r.A, 'm²', 0], ['Retention time at average flow', r.h, 'h', 2], ['Retention time at peak flow', r.hp, 'h', 2], ['Surface overflow rate, average', r.sor, 'm³/m²·d', 1], ['Surface overflow rate, peak', r.sorp, 'm³/m²·d', 1]],
    note: 'HRT = V/Q, SOR = Q/A. Typical: primary clarifiers 1.5–2.5 h and 30–50 m³/m²·d at average flow; secondary clarifiers 16–28 m³/m²·d average, ≤ 40–64 at peak — check the design standard for the project.' },
  dose: { label: '🧪 Chemical dosing', fields: [['q', 'Flow treated', 'm³/h', 850], ['mg', 'Dose (as active chemical)', 'mg/L', 5], ['pct', 'Product strength', '% w/w (NaOCl ≈ 10–12.5, FeCl₃ ≈ 40)', 12.5], ['rho', 'Product density', 'kg/L (NaOCl 12.5% ≈ 1.2)', 1.2], ['hours', 'Dosing hours per day', 'h', 24], ['days', 'Storage needed', 'days', 14]],
    out: r => [['Active chemical', r.act, 'kg/h', 2], ['Active chemical per day', r.actd, 'kg/d', 1], ['Product', r.prod, 'kg/h', 2], ['Dosing pump flow', r.lh, 'L/h', 1], ['Product per day', r.ld, 'L/d', 0], ['Storage volume', r.store, 'm³', 2]],
    note: 'Active kg/h = Q·dose/1000; product L/h = active / strength / density. Size the dosing pump for the maximum dose and flow with turndown for the minimum; sodium hypochlorite loses strength in storage (heat and sunlight).' },
});

/* --- calc note (Word) for any calculator --- */
function calcNoteBtns() { return `<button class="btn sm" data-act="calc-note">📄 Calc note (Word)</button>`; }
Object.assign(ACT, {
  'calc-note': async () => {
    const k = UI.calc, c = CALCS[k], v = calcValues(k), r = CALC[k](Object.fromEntries(Object.entries(v).map(([a, b]) => [a, +b])));
    const title = c.label.replace(/^\S+\s/, '');
    const blob = await docxDoc(`Calculation note — ${title}`, `${St.settings.me.name || ''}${St.settings.me.org ? ', ' + St.settings.me.org : ''} · ${fmtDate(T(), { day: 'numeric', month: 'long', year: 'numeric' })}`, [
      { h: 'Inputs', table: { head: ['Input', 'Value', 'Unit'], rows: c.fields.map(([f, l, u]) => [l, String(v[f]), u]) } },
      { h: 'Results', table: { head: ['Result', 'Value', 'Unit'], rows: c.out(r).map(([l, x, u, dp]) => [l, fmtNum(x, dp), u || '']) } },
      { h: 'Method and notes', p: [c.note] },
      { h: 'Sign-off', table: { head: ['', 'Name', 'Date', 'Signature'], rows: [['Prepared', St.settings.me.name || '', fmtDate(T()), ''], ['Checked', '', '', ''], ['Approved', '', '', '']] } },
    ]);
    await offerFile(`calc-note-${k}-${T()}.docx`, blob);
  },
});
