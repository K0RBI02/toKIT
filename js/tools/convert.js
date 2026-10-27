// Converters. Only the currency converter goes online, to fetch today's exchange rates.

const fmtNum = (n, digits = 6) => {
  if (!isFinite(n)) return '';
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6)) return n.toExponential(4);
  return Number(n.toPrecision(12)).toLocaleString('en', { maximumFractionDigits: digits, useGrouping: false });
};
const parseNum = (s) => Number(String(s).replace(',', '.').replace(/\s/g, ''));

// A "from / swap / to" row used by units and currency
function convertPair({ units, from, to, convert }) {
  const a = h('input', { class: 'input is-big', inputmode: 'decimal', value: '1', 'aria-label': 'Value' });
  const b = h('input', { class: 'input is-big', inputmode: 'decimal', 'aria-label': 'Result' });
  const ua = select(units, from, () => run('a'));
  const ub = select(units, to, () => run('a'));
  let last = 'a';
  function run(side = last) {
    last = side;
    if (side === 'a') { const v = parseNum(a.value); b.value = a.value.trim() && isFinite(v) ? fmtNum(convert(v, ua.value, ub.value)) : ''; }
    else { const v = parseNum(b.value); a.value = b.value.trim() && isFinite(v) ? fmtNum(convert(v, ub.value, ua.value)) : ''; }
    pair.onChange?.();
  }
  a.addEventListener('input', () => run('a'));
  b.addEventListener('input', () => run('b'));
  const swap = iconBtn('swap', 'Swap', () => { [ua.value, ub.value] = [ub.value, ua.value]; run('a'); });
  const pair = h('div', { class: 'convert-pair' },
    h('div', { class: 'field' }, a, ua),
    swap,
    h('div', { class: 'field' }, b, ub),
  );
  Object.assign(pair, { run, a, ua, ub, setUnits(list, f, t) {
    ua.replaceChildren(...list.map(([v, l]) => h('option', { value: v }, l)));
    ub.replaceChildren(...list.map(([v, l]) => h('option', { value: v }, l)));
    ua.value = f; ub.value = t;
    run('a');
  } });
  return pair;
}

// ---------- Units ----------

// Factor to the first unit of each group
const UNITS = {
  Length: { m: ['metres', 1], km: ['kilometres', 1000], cm: ['centimetres', 0.01], mm: ['millimetres', 0.001], mi: ['miles', 1609.344], yd: ['yards', 0.9144], ft: ['feet', 0.3048], in: ['inches', 0.0254], nmi: ['nautical miles', 1852] },
  Weight: { kg: ['kilograms', 1], g: ['grams', 0.001], mg: ['milligrams', 1e-6], t: ['tonnes', 1000], lb: ['pounds', 0.45359237], oz: ['ounces', 0.028349523125], st: ['stone', 6.35029318] },
  Temperature: { c: ['°C Celsius'], f: ['°F Fahrenheit'], k: ['K Kelvin'] },
  Volume: { l: ['litres', 1], ml: ['millilitres', 0.001], m3: ['cubic metres', 1000], gal: ['US gallons', 3.785411784], qt: ['US quarts', 0.946352946], cup: ['US cups', 0.2365882365], floz: ['US fluid ounces', 0.0295735295625], tbsp: ['tablespoons', 0.01478676478125], tsp: ['teaspoons', 0.00492892159375] },
  Area: { m2: ['square metres', 1], km2: ['square kilometres', 1e6], ha: ['hectares', 1e4], a: ['ares', 100], ft2: ['square feet', 0.09290304], ac: ['acres', 4046.8564224], mi2: ['square miles', 2589988.110336] },
  Speed: { kmh: ['km/h', 1], ms: ['m/s', 3.6], mph: ['mph', 1.609344], kn: ['knots', 1.852] },
  Data: { B: ['bytes', 1], KB: ['kilobytes (1000)', 1e3], MB: ['megabytes', 1e6], GB: ['gigabytes', 1e9], TB: ['terabytes', 1e12], KiB: ['kibibytes (1024)', 1024], MiB: ['mebibytes', 1024 ** 2], GiB: ['gibibytes', 1024 ** 3], TiB: ['tebibytes', 1024 ** 4] },
  Time: { s: ['seconds', 1], ms: ['milliseconds', 0.001], min: ['minutes', 60], h: ['hours', 3600], d: ['days', 86400], wk: ['weeks', 604800], mo: ['months (avg)', 2629746], y: ['years (avg)', 31556952] },
};
const toC = { c: (v) => v, f: (v) => (v - 32) * 5 / 9, k: (v) => v - 273.15 };
const fromC = { c: (v) => v, f: (v) => v * 9 / 5 + 32, k: (v) => v + 273.15 };

tool({
  id: 'units',
  cat: 'convert',
  name: 'Unit converter',
  desc: 'Length, weight, temperature, volume, area, speed, data and time.',
  intro: 'Type on either side. Below you see the value in every other unit too.',
  keywords: 'unit convert length distance weight mass temperature celsius fahrenheit volume litre gallon area speed data bytes time km miles kg pounds',
  mount(root) {
    const { work, side } = layout(root);
    let group = 'Length';
    const unitList = () => Object.entries(UNITS[group]).map(([k, [label]]) => [k, label]);
    const convert = (v, a, b) => group === 'Temperature' ? fromC[b](toC[a](v)) : v * UNITS[group][a][1] / UNITS[group][b][1];
    const pair = convertPair({ units: unitList(), from: 'km', to: 'mi', convert });
    const all = h('div', { class: 'list' });
    pair.onChange = () => {
      const v = parseNum(pair.a.value);
      all.replaceChildren(...(isFinite(v) && pair.a.value.trim() ? unitList().filter(([k]) => k !== pair.ua.value).map(([k, label]) => copyRow(fmtNum(convert(v, pair.ua.value, k)), label)) : []));
    };
    const DEFAULTS = { Length: ['km', 'mi'], Weight: ['kg', 'lb'], Temperature: ['c', 'f'], Volume: ['l', 'gal'], Area: ['m2', 'ft2'], Speed: ['kmh', 'mph'], Data: ['GB', 'GiB'], Time: ['h', 'min'] };
    const kind = segmented(Object.keys(UNITS), group, (g) => { group = g; pair.setUnits(unitList(), ...DEFAULTS[g]); }, 'Kind');
    kind.style.flexDirection = 'column';
    work.append(h('div', { class: 'panel' }, pair), field('In other units', all));
    side.append(field('What to convert', kind));
    pair.run('a');
  },
});

// ---------- Currency ----------

let ratesPromise = null;
function fetchRates() {
  ratesPromise ||= (async () => {
    for (const url of ['https://api.frankfurter.dev/v1/latest?base=EUR', 'https://api.frankfurter.app/latest?from=EUR']) {
      try {
        const r = await fetch(url);
        if (r.ok) { const d = await r.json(); return { date: d.date, rates: { EUR: 1, ...d.rates } }; }
      } catch { /* try the next address */ }
    }
    ratesPromise = null;
    throw new Error('Could not load exchange rates. Check your connection and try again.');
  })();
  return ratesPromise;
}
const CURRENCY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });

tool({
  id: 'currency',
  cat: 'convert',
  name: 'Currency converter',
  desc: 'Convert between 30 currencies with today\'s rates.',
  intro: 'Rates come from the European Central Bank and update once per working day.',
  keywords: 'currency exchange rate money euro dollar pound franc yen convert eur usd gbp chf',
  mount(root) {
    const { work, side } = layout(root);
    const status = h('p', { class: 'note' }, 'Loading today\'s rates…');
    const all = h('div', { class: 'list' });
    const holder = h('div', { class: 'panel' }, status);
    work.append(holder, field('Popular currencies', all));
    side.append(h('p', { class: 'note' }, 'The only tool here that goes online: it asks frankfurter.dev for the European Central Bank\'s reference rates. Nothing about you is sent.'));
    fetchRates().then(({ date, rates }) => {
      const codes = Object.keys(rates).sort();
      const units = codes.map((c) => [c, `${c}  ${CURRENCY_NAMES.of(c)}`]);
      const convert = (v, a, b) => v / rates[a] * rates[b];
      const pair = convertPair({ units, from: 'EUR', to: 'USD', convert });
      const POPULAR = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'PLN', 'SEK', 'CZK', 'TRY', 'CAD', 'AUD', 'CNY'];
      pair.onChange = () => {
        const v = parseNum(pair.a.value);
        all.replaceChildren(...(isFinite(v) && pair.a.value.trim() ? POPULAR.filter((c) => c !== pair.ua.value && rates[c]).map((c) =>
          copyRow(convert(v, pair.ua.value, c).toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2, useGrouping: false }), c)) : []));
      };
      status.textContent = `Rates from ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
      holder.replaceChildren(pair, h('p', { class: 'note', style: { marginTop: '12px' } }, status.textContent));
      pair.run('a');
    }).catch((err) => { holder.replaceChildren(h('div', { class: 'error-box' }, err.message)); });
  },
});

// ---------- Time zones ----------

function zoneOffset(zone, date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(date / 1000) * 1000;
}
// A wall-clock time in a zone → the actual moment
function zonedToDate(local, zone) {
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, hh, mi);
  let ts = guess - zoneOffset(zone, new Date(guess));
  ts = guess - zoneOffset(zone, new Date(ts));
  return new Date(ts);
}
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = (Intl.supportedValuesOf?.('timeZone') || ['UTC', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Tokyo']);
const zoneLabel = (z) => z.split('/').pop().replace(/_/g, ' ');

tool({
  id: 'time-zones',
  cat: 'convert',
  name: 'Time zones',
  desc: 'What time is it there? Plan calls across zones.',
  intro: 'Pick a time and place. See what time that is everywhere else on your list.',
  keywords: 'time zone timezone clock world meeting planner utc gmt cet est pst',
  mount(root) {
    const { work, side } = layout(root);
    let zones = [HERE, 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'].filter((z, i, a) => a.indexOf(z) === i);
    const pad = (n) => String(n).padStart(2, '0');
    const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const when = h('input', { class: 'input', type: 'datetime-local', value: nowLocal(), oninput: draw });
    const from = select(ZONES.map((z) => [z, z.replace(/_/g, ' ')]), HERE, draw);
    const add = select([['', 'Add a city or zone…'], ...ZONES.map((z) => [z, z.replace(/_/g, ' ')])], '', (z) => {
      if (z && !zones.includes(z)) zones.push(z);
      add.value = '';
      draw();
    });
    const list = h('div', { class: 'zone-list' });
    function draw() {
      if (!when.value) return;
      const moment = zonedToDate(when.value, from.value);
      const dayOf = (z) => new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
      const baseDay = dayOf(from.value);
      list.replaceChildren(...zones.map((z) => {
        const time = new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' }).format(moment);
        const date = new Intl.DateTimeFormat('en-GB', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short' }).format(moment);
        const off = zoneOffset(z, moment) / 3600000;
        const shift = dayOf(z) === baseDay ? '' : dayOf(z) > baseDay ? ', next day' : ', day before';
        return h('div', { class: 'zone-row' },
          h('div', { class: 'meta' }, h('strong', {}, zoneLabel(z) + (z === HERE ? ' (you)' : '')), h('span', {}, `${date}${shift}, UTC${off >= 0 ? '+' : ''}${off}`)),
          h('time', {}, time),
          z !== HERE ? iconBtn('remove', `Remove ${zoneLabel(z)}`, () => { zones = zones.filter((x) => x !== z); draw(); }, 'is-danger') : null,
        );
      }));
    }
    work.append(list, add);
    side.append(field('Time', when), field('In', from), actions(button('Back to now', () => { when.value = nowLocal(); from.value = HERE; draw(); })));
    draw();
  },
});

// ---------- Timestamps ----------

tool({
  id: 'timestamp',
  cat: 'convert',
  name: 'Unix timestamps',
  desc: 'Turn timestamps into dates and back.',
  intro: 'Paste a Unix timestamp in seconds or milliseconds, or pick a date.',
  keywords: 'unix timestamp epoch time date convert seconds milliseconds iso 8601',
  mount(root) {
    const { work, side } = layout(root);
    const ts = h('input', { class: 'input is-code', inputmode: 'numeric', 'aria-label': 'Timestamp' });
    const date = h('input', { class: 'input', type: 'datetime-local', step: 1, 'aria-label': 'Date' });
    const rows = h('div', { class: 'list' });
    const now = h('code', {});
    const pad = (n) => String(n).padStart(2, '0');
    const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const relative = (d) => {
      const s = (d - Date.now()) / 1000;
      for (const [u, n] of [['year', 31556952], ['month', 2629746], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]) {
        if (Math.abs(s) >= n || u === 'second') return rel.format(Math.round(s / n), u);
      }
    };
    function show(d) {
      if (isNaN(d)) { rows.replaceChildren(h('div', { class: 'error-box' }, 'That is not a date or timestamp')); return; }
      rows.replaceChildren(
        copyRow(String(Math.floor(d / 1000)), 'Seconds'),
        copyRow(String(d.getTime()), 'Millis'),
        copyRow(d.toISOString(), 'ISO 8601'),
        copyRow(d.toUTCString(), 'UTC'),
        copyRow(d.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long' }), 'Your time'),
        copyRow(relative(d), 'Relative'),
      );
    }
    ts.addEventListener('input', () => {
      const n = Number(ts.value.trim());
      if (!ts.value.trim()) return;
      // 13 digits or more means milliseconds
      const d = new Date(Math.abs(n) >= 1e12 ? n : n * 1000);
      if (!isNaN(d)) date.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      show(d);
    });
    date.addEventListener('input', () => {
      const d = new Date(date.value);
      if (!isNaN(d)) ts.value = Math.floor(d / 1000);
      show(d);
    });
    const tick = setInterval(() => (now.textContent = Math.floor(Date.now() / 1000)), 1000);
    now.textContent = Math.floor(Date.now() / 1000);
    const useNow = () => { ts.value = Math.floor(Date.now() / 1000); ts.dispatchEvent(new Event('input')); };

    work.append(h('div', { class: 'two-up' }, field('Timestamp', ts), field('Date and time', date)), rows);
    side.append(field('Right now', h('div', { class: 'big-output' }, now, iconBtn('copy', 'Copy', () => copyText(now.textContent)))), actions(button('Use now', useNow)));
    useNow();
    return () => clearInterval(tick);
  },
});

// ---------- Number systems ----------

tool({
  id: 'number-base',
  cat: 'convert',
  name: 'Binary, hex & decimal',
  desc: 'Convert numbers between binary, octal, decimal and hex.',
  intro: 'Type in any field and the others follow. Works with very large numbers.',
  keywords: 'binary hex hexadecimal decimal octal base number system convert radix bits',
  mount(root) {
    const { work, side } = layout(root);
    const BASES = [['Decimal', 10, '0-9'], ['Hexadecimal', 16, '0-9a-f'], ['Binary', 2, '01'], ['Octal', 8, '0-7']];
    const PREFIX = { 16: '0x', 2: '0b', 8: '0o' };
    const inputs = {};
    const error = h('div', { class: 'error-box', hidden: true });
    const bits = h('p', { class: 'note' });
    const group = checkbox('Group digits', false, () => update(10, inputs[10].value.replace(/\s/g, '')));
    const fmt = (s, base) => {
      if (!group.input.checked) return s;
      const size = base === 10 ? 3 : 4;
      const neg = s.startsWith('-');
      const body = neg ? s.slice(1) : s;
      return (neg ? '-' : '') + body.replace(new RegExp(`\\B(?=(.{${size}})+$)`, 'g'), ' ');
    };
    function update(fromBase, raw) {
      error.hidden = true;
      let s = raw.trim().replace(/[\s_]/g, '').toLowerCase();
      const neg = s.startsWith('-');
      if (neg) s = s.slice(1);
      if (PREFIX[fromBase] && s.startsWith(PREFIX[fromBase])) s = s.slice(2);
      if (!s) { for (const [, b] of BASES) if (b !== fromBase) inputs[b].value = ''; bits.textContent = ''; return; }
      const valid = new RegExp(`^[${BASES.find((b) => b[1] === fromBase)[2]}]+$`);
      if (!valid.test(s)) { error.textContent = `That is not a valid ${BASES.find((b) => b[1] === fromBase)[0].toLowerCase()} number`; error.hidden = false; return; }
      let n = [...s].reduce((acc, c) => acc * BigInt(fromBase) + BigInt(parseInt(c, 36)), 0n);
      if (neg) n = -n;
      for (const [, b] of BASES) if (b !== fromBase || group.input.checked) inputs[b].value = fmt(n.toString(b), b);
      const abs = n < 0n ? -n : n;
      bits.textContent = `${plural(abs.toString(2).length, 'bit')} needed.`;
    }
    for (const [label, base] of BASES) {
      inputs[base] = h('input', { class: 'input is-code', spellcheck: false, 'aria-label': label, oninput: (e) => update(base, e.target.value) });
    }
    work.append(h('div', { class: 'panel', style: { display: 'grid', gap: '16px' } }, ...BASES.map(([label, base]) =>
      field(label, h('div', { class: 'row' }, h('div', { class: 'grow' }, inputs[base]), iconBtn('copy', `Copy ${label}`, () => copyText(inputs[base].value.replace(/\s/g, '')))))
    )), error);
    side.append(group, bits);
    inputs[10].value = '255';
    update(10, '255');
  },
});

// ---------- Colour formats ----------

function parseColor(text) {
  const ctx = h_canvasCtx();
  ctx.fillStyle = '#000';
  ctx.fillStyle = text;
  const a = ctx.fillStyle;
  ctx.fillStyle = '#fff';
  ctx.fillStyle = text;
  if (a !== ctx.fillStyle) return null;   // the browser rejected it both times
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data;
  ctx.clearRect(0, 0, 1, 1);
  return { r, g, b, a: alpha / 255 };
}
let colorCtx;
const h_canvasCtx = () => (colorCtx ||= h('canvas', { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true }));

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(hue * 60), Math.round(s * 100), Math.round(l * 100)];
}

tool({
  id: 'color-converter',
  cat: 'convert',
  name: 'Colour formats',
  desc: 'HEX, RGB, HSL and CMYK, plus contrast for text.',
  intro: 'Type a colour in any format, a CSS name like "tomato" works too, or use the picker.',
  keywords: 'color colour hex rgb hsl cmyk convert picker contrast css',
  mount(root) {
    const { work, side } = layout(root);
    const input = textInput({ value: '#FF8A4C', class: 'input is-code' });
    const picker = h('input', { type: 'color', value: '#ff8a4c', 'aria-label': 'Colour picker' });
    const preview = h('div', { class: 'color-preview' });
    const rows = h('div', { class: 'list' });
    const contrast = h('div', { class: 'list' });
    const error = h('div', { class: 'error-box', hidden: true });
    function update(text) {
      const c = parseColor(text.trim());
      error.hidden = !!c;
      if (!c) { error.textContent = 'That is not a colour this tool knows'; return; }
      const hex = '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const [hh, s, l] = rgbToHsl(c);
      const k = 1 - Math.max(c.r, c.g, c.b) / 255;
      const cmyk = k === 1 ? [0, 0, 0, 100] : [c.r, c.g, c.b].map((v) => Math.round((1 - v / 255 - k) / (1 - k) * 100)).concat(Math.round(k * 100));
      preview.style.background = hex;
      picker.value = hex.toLowerCase();
      rows.replaceChildren(
        copyRow(hex, 'HEX'),
        copyRow(`rgb(${c.r} ${c.g} ${c.b})`, 'RGB'),
        copyRow(`hsl(${hh} ${s}% ${l}%)`, 'HSL'),
        copyRow(`cmyk(${cmyk.map((v) => v + '%').join(' ')})`, 'CMYK'),
      );
      const L = luminance(hex);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      contrast.replaceChildren(...[['White text', 1, '#fff'], ['Black text', 0, '#111110']].map(([label, lum, color]) => {
        const r = ratio(L, lum);
        return h('div', { class: 'list-item', style: { background: hex, color, borderColor: 'transparent' } },
          h('div', { class: 'meta' }, h('strong', {}, label), h('span', { style: { color } }, `${r.toFixed(2)} : 1, ${r >= 7 ? 'great for any text' : r >= 4.5 ? 'fine for normal text' : r >= 3 ? 'big text only' : 'hard to read'}`)),
        );
      }));
    }
    input.addEventListener('input', () => update(input.value));
    picker.addEventListener('input', () => { input.value = picker.value.toUpperCase(); update(input.value); });
    work.append(preview, rows, field('Text on this colour', contrast));
    side.append(field('Colour', h('div', { class: 'row' }, h('div', { class: 'grow' }, input), picker)), error);
    update(input.value);
  },
});
