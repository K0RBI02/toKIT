// Everyday calculators: dates and percentages.

const DAY = 86400000;
const toDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Whole years, months and days from a to b (a <= b), the way people count birthdays
function calendarDiff(a, b) {
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}

function workdays(a, b) {
  let n = 0;
  for (let t = new Date(a); t < b; t.setDate(t.getDate() + 1)) if (t.getDay() % 6) n++;
  return n;
}

tool({
  id: 'date-calc',
  cat: 'convert',
  name: 'Date calculator',
  desc: 'Days between two dates, or a date plus some days.',
  intro: 'How long until the holidays? What date is 90 days from now? Both work here.',
  keywords: 'date days between calculator add subtract weeks months deadline countdown age tage datum rechner',
  mount(root) {
    const { work, side } = layout(root);
    const today = isoDay(new Date());
    const mode = segmented([['between', 'Days between'], ['add', 'Add or subtract']], 'between', () => { show(); calc(); }, 'Mode');

    const from = h('input', { class: 'input', type: 'date', value: today, oninput: () => calc() });
    const to = h('input', { class: 'input', type: 'date', value: isoDay(new Date(Date.now() + 30 * DAY)), oninput: () => calc() });
    const includeEnd = checkbox('Count the end date too', false, () => calc());
    const betweenPanel = h('div', { class: 'panel two-up' }, field('From', from), field('To', to));

    const base = h('input', { class: 'input', type: 'date', value: today, oninput: () => calc() });
    const amount = h('input', { class: 'input', type: 'number', value: 90, oninput: () => calc() });
    const unit = select([['d', 'days'], ['w', 'weeks'], ['m', 'months'], ['y', 'years']], 'd', () => calc());
    const sign = segmented([['1', 'Add'], ['-1', 'Subtract']], '1', () => calc(), 'Direction');
    const addPanel = h('div', { class: 'panel two-up' }, field('Start', base), field('Amount', h('div', { class: 'row' }, h('div', { class: 'grow' }, amount), unit)));

    const result = h('div', {});
    function show() {
      betweenPanel.hidden = includeEnd.hidden = mode.value !== 'between';
      addPanel.hidden = sign.parentElement.hidden = mode.value !== 'add';
    }
    function calc() {
      if (mode.value === 'between') {
        if (!from.value || !to.value) return result.replaceChildren();
        let a = toDay(from.value), b = toDay(to.value);
        const back = b < a;
        if (back) [a, b] = [b, a];
        const end = includeEnd.input.checked ? new Date(b.getTime() + DAY) : b;
        const days = Math.round((end - a) / DAY);
        const { y, m, d } = calendarDiff(a, end);
        const parts = [y && plural(y, 'year'), m && plural(m, 'month'), (d || (!y && !m)) && plural(d, 'day')].filter(Boolean);
        result.replaceChildren(
          h('div', { class: 'result-hero' }, plural(days, 'day')),
          h('div', { class: 'stat-grid' },
            h('div', { class: 'stat' }, h('b', {}, `${Math.floor(days / 7)} w ${days % 7} d`), h('span', {}, 'weeks and days')),
            h('div', { class: 'stat' }, h('b', {}, parts.join(', ')), h('span', {}, 'in calendar terms')),
            h('div', { class: 'stat' }, h('b', {}, workdays(a, end).toLocaleString('en')), h('span', {}, 'weekdays (Mon to Fri)')),
          ),
          back ? h('p', { class: 'note' }, 'The second date is before the first, so this counts backwards.') : null,
        );
      } else {
        if (!base.value) return result.replaceChildren();
        const n = (Number(amount.value) || 0) * Number(sign.value);
        const d = toDay(base.value);
        if (unit.value === 'd') d.setDate(d.getDate() + n);
        if (unit.value === 'w') d.setDate(d.getDate() + n * 7);
        if (unit.value === 'm') d.setMonth(d.getMonth() + n);
        if (unit.value === 'y') d.setFullYear(d.getFullYear() + n);
        result.replaceChildren(h('div', { class: 'result-hero', style: { fontSize: 'clamp(36px, 6vw, 64px)' } }, longDate(d)), copyRow(isoDay(d), 'ISO'));
      }
    }
    work.append(betweenPanel, addPanel, result);
    side.append(field('What', mode), includeEnd, field('Direction', sign), actions(button('Today', () => { from.value = base.value = today; calc(); })));
    show();
    calc();
  },
});

tool({
  id: 'percent',
  cat: 'convert',
  name: 'Percent calculator',
  desc: 'Percent of a number, what percent, and percent change.',
  intro: 'Three everyday percentage questions. Type in any box and the answer updates.',
  keywords: 'percent percentage calculator discount increase decrease change rabatt prozent rechner tip vat mwst',
  mount(root) {
    const { work } = layout(root, { side: false });
    const num = (v) => h('input', { class: 'input is-big', inputmode: 'decimal', value: v });
    const out = () => h('output', { class: 'percent-out' });
    const fmt = (n) => isFinite(n) ? Number(n.toFixed(4)).toLocaleString('en', { maximumFractionDigits: 4 }) : '–';
    const rows = [
      { a: num(20), b: num(150), o: out(), before: 'What is', mid: '% of', calc: (a, b) => fmt(a / 100 * b) },
      { a: num(30), b: num(120), o: out(), before: '', mid: 'is what % of', calc: (a, b) => `${fmt(a / b * 100)} %` },
      { a: num(80), b: num(100), o: out(), before: 'From', mid: 'to', calc: (a, b) => { const p = (b - a) / Math.abs(a) * 100; return `${p > 0 ? '+' : ''}${fmt(p)} %`; } },
    ];
    const calcAll = () => rows.forEach((r) => {
      r.o.textContent = r.calc(parseNum(r.a.value), parseNum(r.b.value));
    });
    for (const r of rows) {
      r.a.addEventListener('input', calcAll);
      r.b.addEventListener('input', calcAll);
      work.append(h('div', { class: 'panel percent-row' },
        r.before ? h('span', {}, r.before) : null, r.a, h('span', {}, r.mid), r.b, h('span', {}, '='), r.o,
        iconBtn('copy', 'Copy result', () => copyText(r.o.textContent.replace(/[ %+]/g, '')))));
    }
    work.append(h('p', { class: 'note' }, 'Tip: 19 % VAT on 100 is "What is 19 % of 100". A price going from 80 to 100 is the third row.'));
    calcAll();
  },
});
