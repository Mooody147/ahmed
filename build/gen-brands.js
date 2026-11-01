// builds src/features/57-finance-brands.js from simple-icons (CC0-1.0): only the brands listed here, matched by statement text
const fs = require('fs'), path = require('path'), P = process.argv[2], OUT = process.argv[3];
const data = require(path.join(P, 'data/simple-icons.json')); const L = Array.isArray(data) ? data : data.icons;
const slugOf = t => (L.find(i => i.title === t) || {}).slug;
// [simple-icons slug, how it shows in statements]   — order matters: the more specific first
const OFFICIAL = [
  ['youtubemusic', 'youtube ?music'], ['youtube', 'youtube|yt ?premium'], ['spotify', 'spotify'], ['netflix', 'netflix'],
  ['applemusic', 'apple ?music'], ['appletv', 'apple ?tv'], ['icloud', 'icloud'], ['appstore', 'app ?store'], ['apple', 'apple\\.com|\\bapple\\b|itunes|\\bi(phone|pad)\\b|macbook|airpods'],
  ['googleplay', 'google ?play'], ['googledrive', 'google ?drive'], ['gmail', 'gmail|google ?workspace'], ['google', '\\bgoogle\\b'],
  ['playstation', 'playstation|\\bpsn\\b|sony ?(interactive|network)'], ['steam', 'steampowered|\\bsteam ?(games|purchase)?\\b'], ['epicgames', 'epic ?games'],
  ['ubereats', 'uber ?eats'], ['uber', '\\buber\\b'], ['deliveroo', 'deliveroo'], ['aliexpress', 'aliexpress'], ['ebay', '\\bebay\\b'],
  ['ikea', '\\bikea\\b'], ['carrefour', 'carrefour'], ['mcdonalds', 'mc ?donald'], ['kfc', '\\bkfc\\b'], ['starbucks', 'starbucks'], ['burgerking', 'burger ?king'],
  ['vodafone', 'vodafone'], ['orange', '\\borange\\b(?! ?(juice|cake|chicken))'],
  ['messenger', 'messenger'], ['instagram', 'instagram'], ['whatsapp', 'whatsapp'], ['facebook', 'facebook|facebk|\\bfb\\.me\\b|meta ?platforms|\\bfb ?ads\\b'],
  ['tiktok', 'tik ?tok'], ['snapchat', 'snapchat'], ['x', '\\btwitter\\b|\\bx ?premium\\b|\\bx\\.com\\b'], ['telegram', 'telegram'], ['discord', 'discord'], ['twitch', 'twitch'],
  ['paypal', 'paypal'], ['bookingdotcom', 'booking\\.com|\\bbooking ?com\\b'], ['airbnb', 'airbnb'], ['emirates', '\\bemirates\\b(?! ?nbd)'], ['qatarairways', 'qatar ?airways'], ['turkishairlines', 'turkish ?airlines|\\bthy\\b'],
  ['shell', '\\bshell\\b'], ['claude', 'claude\\.ai|anthropic|\\bclaude\\b'], ['dropbox', 'dropbox'], ['zoom', 'zoom\\.us|\\bzoom\\b'], ['notion', '\\bnotion\\b'], ['github', 'github'], ['figma', 'figma'],
  ['duolingo', 'duolingo'], ['coursera', 'coursera'], ['udemy', 'udemy'], ['chessdotcom', 'chess\\.com'], ['deezer', 'deezer'], ['hbomax', 'hbo ?max|\\bhbo\\b'], ['crunchyroll', 'crunchyroll'],
  ['samsung', 'samsung'], ['huawei', 'huawei'], ['xiaomi', 'xiaomi|\\bmi ?store\\b'], ['lenovo', 'lenovo'], ['dell', '\\bdell\\b'], ['hp', '\\bhp ?(store|inc)?\\b|hewlett'],
  ['zara', '\\bzara\\b'], ['handm', '\\bh ?& ?m\\b|\\bh and m\\b|hennes'], ['nike', '\\bnike\\b'], ['adidas', 'adidas'], ['puma', '\\bpuma\\b'], ['bata', '\\bbata\\b'],
  ['fawry', 'fawry|فوري'], ['fitbit', 'fitbit'], ['visa', '\\bvisa ?(fee|charge)\\b'], ['mastercard', 'mastercard'],
];
// no free official logo (the owners do not allow it): a lettered tile in the brand's colour instead
const LETTERED = [
  ['amazon', 'Amazon', 'a', '#FF9900', '#000', 'amazon|amzn'], ['microsoft', 'Microsoft', 'M', '#0078D4', '#fff', 'microsoft|\\bmsft\\b|xbox|office ?365'],
  ['adobe', 'Adobe', 'A', '#FA0F00', '#fff', '\\badobe\\b'], ['openai', 'ChatGPT', 'AI', '#10A37F', '#fff', 'openai|chat ?gpt'], ['linkedin', 'LinkedIn', 'in', '#0A66C2', '#fff', 'linkedin'],
  ['talabat', 'Talabat', 't', '#FF5A00', '#fff', 'talabat|طلبات'], ['careem', 'Careem', 'C', '#37B44E', '#fff', 'careem|كريم'], ['noon', 'noon', 'n', '#FEEE00', '#000', '\\bnoon\\b|نون'],
  ['jumia', 'Jumia', 'J', '#F68B1E', '#fff', 'jumia|جوميا'], ['disneyplus', 'Disney+', 'D+', '#113CCF', '#fff', 'disney'], ['etisalat', 'e&', 'e&', '#E00800', '#fff', 'etisalat|\\be&\\b|اتصالات'],
  ['we', 'WE', 'WE', '#5C2D91', '#fff', '\\bwe ?(telecom|internet|home)\\b|telecom egypt|المصرية للاتصالات'], ['shahid', 'Shahid', 'S', '#00C389', '#000', 'shahid|شاهد'],
  ['anghami', 'Anghami', 'A', '#A637DB', '#fff', 'anghami|أنغامي'], ['bolt', 'Bolt', 'B', '#34D186', '#000', '\\bbolt\\b'], ['indrive', 'inDrive', 'iD', '#C1F11D', '#000', 'in ?drive'],
  ['dominos', "Domino's", 'D', '#006491', '#fff', 'domino'], ['pizzahut', 'Pizza Hut', 'PH', '#EE3124', '#fff', 'pizza ?hut'], ['instapay', 'InstaPay', 'IP', '#3B1F6E', '#fff', 'instapay|إنستاباي'],
];
const out = [];
for (const [slug, re] of OFFICIAL) {
  const i = L.find(x => (x.slug || '') === slug) || L.find(x => x.title.toLowerCase().replace(/[^a-z0-9]/g, '') === slug);
  const svg = fs.readFileSync(path.join(P, 'icons', slug + '.svg'), 'utf8'), d = /<path d="([^"]+)"/.exec(svg)[1];
  out.push({ id: slug, name: i ? i.title : slug, hex: '#' + (i ? i.hex : '777777'), re, d });
}
for (const [id, name, letters, hex, ink, re] of LETTERED) out.push({ id, name, hex, re, letters, ink });
const js = `// Money canvas — brand logos. A transaction, subscription, merchant or service that belongs to a known company shows
// that company's logo: on the canvas's cards, in your boxes, in a card's latest transactions and in All transactions.
// Logos: Simple Icons (simpleicons.org, CC0-1.0), embedded in the page — nothing is fetched, no merchant name ever leaves
// the page. The trademarks belong to their owners and are shown only to name the company. A company whose owner does
// not allow its logo to be shared freely gets a lettered tile in its colour instead (marked "letters").
// Generated from simple-icons ${require(path.join(P, 'package.json')).version} — edit the lists in the generator, not this file.
const FIN_BRANDS = ${JSON.stringify(out.map(b => ({ ...b, re: undefined, m: b.re })))}.map(b => ({ ...b, re: new RegExp(b.m, 'i') }));
const FIN_BRAND_CACHE = new Map();
// the company a description belongs to (or null)
function finBrand(text) {
  const s = String(text || ''); if (!s) return null; if (FIN_BRAND_CACHE.has(s)) return FIN_BRAND_CACHE.get(s);
  const b = FIN_BRANDS.find(x => x.re.test(s)) || null; if (FIN_BRAND_CACHE.size > 3000) FIN_BRAND_CACHE.clear(); FIN_BRAND_CACHE.set(s, b); return b;
}
// light brand colours get dark ink on their tile
const finBrandInk = hex => { const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.72 ? '#111' : '#fff'; };
// its logo as a small tile
function finLogo(text, cls) {
  const b = typeof text === 'object' && text ? text : finBrand(text); if (!b) return '';
  const inner = b.d ? \`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="\${finBrandInk(b.hex)}" d="\${b.d}"/></svg>\` : \`<span style="color:\${b.ink}">\${esc(b.letters)}</span>\`;
  return \`<i class="fin-logo\${b.d ? '' : ' letters'}\${cls ? ' ' + cls : ''}" style="background:\${b.hex}" title="\${esc(b.name)}" role="img" aria-label="\${esc(b.name)}">\${inner}</i>\`;
}
// the company a canvas card belongs to: recurring payments, instalments, goals, income, your boxes' cards — not your
// own accounts, categories, people or holdings
function finCardBrand(c) { if (!c || !c.id || /^(a|c|t|th|h|l|q|d|cm|g):/.test(c.id) || /tool|more/.test(c.cls || '')) return null; return finBrand(c.label); }
Object.assign(window.__FIN, { brand: t => { const b = finBrand(t); return b ? { id: b.id, name: b.name, official: !!b.d } : null; } });
`;
fs.writeFileSync(OUT, js); console.log('brands', out.length, 'official', out.filter(b => b.d).length, 'bytes', js.length);
