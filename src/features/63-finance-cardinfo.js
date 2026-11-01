// Money canvas — every card says, in one short line under it, what it represents and how it works ("Money in your bank
// account", "What you owe · free = limit − owed", "Subscription · counted while it runs"…) — short enough to be read
// whole on the narrowest card. Hidden when zoomed far out, where a card is only its name over its figure.

function finCardDesc(c) {
  if (!c || !c.id) return '';
  const id = c.id, k = id.split(/[:~]/)[0], key = id.slice(id.indexOf(':') + 1);
  if ((c.cls || '').includes('tool') || (c.cls || '').includes('more') || /:none$/.test(id)) return '';
  if (k === 'a') { const a = finAcct(key); if (!a) return ''; return a.kind === 'credit_card' ? 'What you owe · free = limit − owed' : a.kind === 'bnpl' ? 'Instalment credit you can use' : a.kind === 'cash' ? 'Cash in hand' : 'Money in your bank account'; }
  if (k === 'in') return id === 'in:cib' ? 'Passive income · your investment pays' : id === 'in:salary' ? 'Your salary, each month' : 'Income that comes in again';
  if (k === 'c') return 'Your usual month in this category';
  if (k === 'rc') { if (id === 'rc~months') return 'Added, stopped and saved, by month';
    const it = typeof finRec === 'function' ? finRec().items.find(i => 'rc:' + i.key === id) : null; if (!it) return '';
    if (it.status === 'verify') return 'Not counted until you confirm';
    if (it.status === 'ended') return 'Stopped · no longer counted';
    return it.kind === 'inst' ? 'Instalment · monthly until it ends' : it.group === 'subs' ? 'Subscription · counted while it runs' : it.group === 'fixed' ? 'Fixed · same amount every month' : 'Repeats · same amount each time'; }
  if (k === 'i') return 'Monthly until its last payment';
  if (k === 'cm') return id === 'cm:card' ? 'Minimum payment and its due date' : 'Free limit and its terms';
  if (k === 'h') return 'You own it · one of your assets';
  if (k === 'l') return 'Still to pay · a liability';
  if (k === 't') return 'Their money · never counted as yours';
  if (k === 'th') return 'Belongs to someone else';
  if (k === 'b') return 'A planned purchase · checked for you';
  if (k === 'g') return 'A savings goal · saved monthly';
  if (k === 'src') return { 'src:cash': 'After reserve and others’ money', 'src:save': 'Left each month after spending', 'src:card': 'Your free card limit', 'src:halan': 'Your free Halan limit' }[id] || '';
  if (k === 'd') return 'Sorted by Claude · you can change it';
  if (k === 'q') return 'A question for you';
  return '';
}
