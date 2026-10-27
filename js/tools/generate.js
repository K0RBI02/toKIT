// Generators. Randomness comes from crypto.getRandomValues, not Math.random.

function randomInt(max) {
  // Rejection sampling, so every value is equally likely
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}
const randomFrom = (list) => list[randomInt(list.length)];

// ---------- Password ----------

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
};
const AMBIGUOUS = /[Il1O0o]/g;

tool({
  id: 'password',
  cat: 'generate',
  name: 'Password generator',
  desc: 'Strong random passwords, made on your device.',
  intro: 'A new password appears every time you change a setting. Nothing is saved or sent.',
  keywords: 'password generator random secure strong passphrase pin',
  mount(root) {
    const { work, side } = layout(root);
    const code = h('code', {});
    const meter = h('i', {});
    const strength = h('p', { class: 'note' });
    const list = h('div', { class: 'list' });

    const length = rangeField('Length', { min: 4, max: 64, value: 20, onInput: generate });
    const opts = {
      lower: checkbox('Lowercase a–z', true, generate),
      upper: checkbox('Uppercase A–Z', true, generate),
      digits: checkbox('Numbers 0–9', true, generate),
      symbols: checkbox('Symbols !@#…', true, generate),
      ambiguous: checkbox('Avoid look-alikes (I l 1 O 0)', false, generate),
    };

    function makeOne() {
      const chosen = Object.keys(SETS).filter((k) => opts[k].input.checked);
      if (!chosen.length) return '';
      const clean = (s) => opts.ambiguous.input.checked ? s.replace(AMBIGUOUS, '') : s;
      const pool = clean(chosen.map((k) => SETS[k]).join(''));
      const n = Number(length.input.value);
      // At least one character from every chosen set, then shuffle
      const chars = chosen.slice(0, n).map((k) => randomFrom(clean(SETS[k])));
      while (chars.length < n) chars.push(randomFrom(pool));
      for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
      return { value: chars.join(''), bits: n * Math.log2(pool.length) };
    }

    function generate() {
      const first = makeOne();
      if (!first) { code.textContent = 'Pick at least one kind of character'; meter.style.width = '0'; strength.textContent = ''; list.replaceChildren(); return; }
      code.textContent = first.value;
      const b = first.bits;
      const [label, color, pct] = b < 40 ? ['Weak', 'var(--bad)', 20] : b < 64 ? ['Okay', '#E0A030', 45] : b < 100 ? ['Strong', 'var(--good)', 75] : ['Very strong', 'var(--good)', 100];
      meter.style.width = `${pct}%`;
      meter.style.backgroundColor = color;
      strength.textContent = `${label}, about ${Math.round(b)} bits of randomness.`;
      list.replaceChildren(...Array.from({ length: 5 }, () => copyRow(makeOne().value)));
    }

    const again = button('New password', generate, 'primary');
    work.append(
      h('div', { class: 'big-output' }, code, iconBtn('copy', 'Copy password', () => copyText(code.textContent, 'Password copied'))),
      h('div', { class: 'meter' }, meter),
      strength,
      field('More options to pick from', list),
    );
    side.append(length, ...Object.values(opts), actions(again));
    generate();
  },
});

// ---------- UUID ----------

tool({
  id: 'uuid',
  cat: 'generate',
  name: 'UUID generator',
  desc: 'Random unique IDs (version 4), one or many.',
  intro: 'Random IDs for databases, tests or anything that needs to be unique.',
  keywords: 'uuid guid unique id identifier random v4',
  mount(root) {
    const { work, side } = layout(root);
    const out = h('textarea', { class: 'input is-code', readonly: true, style: { minHeight: '320px' } });
    const count = h('input', { class: 'input', type: 'number', min: 1, max: 1000, value: 10, oninput: generate });
    const upper = checkbox('Uppercase', false, generate);
    const noDash = checkbox('Without hyphens', false, generate);
    function generate() {
      const n = clamp(Number(count.value) || 1, 1, 1000);
      out.value = Array.from({ length: n }, () => {
        let id = crypto.randomUUID();
        if (noDash.input.checked) id = id.replace(/-/g, '');
        return upper.input.checked ? id.toUpperCase() : id;
      }).join('\n');
    }
    work.append(out);
    side.append(field('How many', count), upper, noDash, actions(
      button('Generate new', generate, 'primary'),
      button('Copy all', () => copyText(out.value, 'IDs copied')),
    ));
    generate();
  },
});

// ---------- Colour palette ----------

const hsl = (h_, s, l) => `hsl(${Math.round(h_)} ${Math.round(s)}% ${Math.round(l)}%)`;
function hslToHex(h_, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h_ / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const SCHEMES = {
  analogous: (base) => [-40, -20, 0, 20, 40].map((d, i) => [base + d, 55 + i * 5, 35 + i * 10]),
  complementary: (base) => [[base, 70, 30], [base, 55, 50], [base, 30, 90], [base + 180, 60, 60], [base + 180, 75, 40]],
  triadic: (base) => [[base, 65, 45], [base + 120, 60, 50], [base + 240, 60, 50], [base, 30, 90], [base + 120, 35, 25]],
  shades: (base) => [92, 75, 55, 38, 20].map((l) => [base, 60, l]),
  pastel: (base) => [0, 72, 144, 216, 288].map((d) => [base + d, 80, 86]),
};

tool({
  id: 'color-palette',
  cat: 'generate',
  name: 'Colour palettes',
  desc: 'Five colours that go together. Lock the ones you like.',
  intro: 'Press space or the button for new colours. Lock a colour to keep it.',
  keywords: 'color colour palette scheme generator design hex css',
  mount(root) {
    const { work, side } = layout(root);
    let colors = [];
    const swatches = h('div', { class: 'swatches' });
    const scheme = segmented([['random', 'Surprise me'], ['analogous', 'Neighbours'], ['complementary', 'Opposites'], ['triadic', 'Triad'], ['shades', 'Shades'], ['pastel', 'Pastel']], 'random', generate, 'Scheme');
    scheme.style.flexDirection = 'column';

    function generate() {
      const kind = scheme.value === 'random' ? randomFrom(Object.keys(SCHEMES)) : scheme.value;
      const fresh = SCHEMES[kind](randomInt(360)).map(([hh, s, l]) => hslToHex(((hh % 360) + 360) % 360, s, l));
      colors = fresh.map((hex, i) => colors[i]?.locked ? colors[i] : { hex, locked: false });
      draw();
    }
    function draw() {
      swatches.replaceChildren(...colors.map((c) => {
        const light = luminance(c.hex) > 0.45;
        return h('div', { class: 'swatch', style: { background: c.hex, color: light ? '#111110' : '#fff' } },
          h('b', {}, c.hex),
          h('div', { class: 'row' },
            iconBtn('copy', `Copy ${c.hex}`, () => copyText(c.hex, `${c.hex} copied`)),
            iconBtn('lock', c.locked ? 'Unlock colour' : 'Lock colour', () => { c.locked = !c.locked; draw(); }, c.locked ? 'is-on' : ''),
          ),
        );
      }));
    }
    const onKey = (e) => {
      if (e.code === 'Space' && !/^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(document.activeElement?.tagName)) { e.preventDefault(); generate(); }
    };
    window.addEventListener('keydown', onKey);

    work.append(swatches, h('p', { class: 'note' }, 'Tip: press space for a new palette.'));
    side.append(field('Kind of palette', scheme), actions(
      button('New colours', generate, 'primary'),
      button('Copy as CSS', () => copyText(`:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n')}\n}`, 'CSS copied')),
      button('Copy hex codes', () => copyText(colors.map((c) => c.hex).join(', '), 'Hex codes copied')),
    ));
    generate();
    return () => window.removeEventListener('keydown', onKey);
  },
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---------- Random ----------

tool({
  id: 'random',
  cat: 'generate',
  name: 'Random picker',
  desc: 'Random numbers, dice, coin flips and picking from a list.',
  intro: 'For raffles, games and decisions you don\'t want to make yourself.',
  keywords: 'random number dice roll coin flip pick choose list lottery raffle teams shuffle decide',
  mount(root) {
    const { work, side } = layout(root);
    const stage = h('div', {});
    const kind = segmented([['number', 'Number'], ['dice', 'Dice'], ['coin', 'Coin'], ['list', 'From a list']], 'number', show, 'What');
    const min = h('input', { class: 'input', type: 'number', value: 1 });
    const max = h('input', { class: 'input', type: 'number', value: 100 });
    const numField = field('Between', h('div', { class: 'row' }, h('div', { class: 'grow' }, min), 'and', h('div', { class: 'grow' }, max)));
    const diceCount = rangeField('Number of dice', { min: 1, max: 10, value: 2 });
    const listInput = textArea({ placeholder: 'One name or option per line', style: { minHeight: '180px' } });
    const pickCount = h('input', { class: 'input', type: 'number', min: 1, value: 1 });
    const listField = h('div', { class: 'field' }, field('Options', listInput), field('How many to pick', pickCount));

    function show() {
      numField.hidden = kind.value !== 'number';
      diceCount.hidden = kind.value !== 'dice';
      listField.hidden = kind.value !== 'list';
      go.textContent = { number: 'Pick a number', dice: 'Roll', coin: 'Flip', list: 'Pick' }[kind.value];
      stage.replaceChildren(h('p', { class: 'note', style: { textAlign: 'center', padding: '48px 0' } }, 'Your result shows up here.'));
    }
    function run() {
      if (kind.value === 'number') {
        let a = Math.ceil(Number(min.value)), b = Math.floor(Number(max.value));
        if (a > b) [a, b] = [b, a];
        stage.replaceChildren(h('div', { class: 'result-hero' }, (a + randomInt(b - a + 1)).toLocaleString('en')));
      } else if (kind.value === 'dice') {
        const rolls = Array.from({ length: Number(diceCount.input.value) }, () => randomInt(6) + 1);
        stage.replaceChildren(
          h('div', { class: 'dice' }, rolls.map((r) => h('div', { class: 'die' }, r))),
          ...(rolls.length > 1 ? [h('p', { class: 'note', style: { textAlign: 'center' } }, `Total ${rolls.reduce((a, b) => a + b, 0)}`)] : []),
        );
      } else if (kind.value === 'coin') {
        stage.replaceChildren(h('div', { class: 'result-hero' }, randomInt(2) ? 'Heads' : 'Tails'));
      } else {
        const items = listInput.value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!items.length) return toast('Add some options first, one per line');
        const n = clamp(Number(pickCount.value) || 1, 1, items.length);
        for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
        const picked = items.slice(0, n);
        stage.replaceChildren(n === 1 ? h('div', { class: 'result-hero' }, picked[0]) : h('ol', { style: { fontSize: '22px', fontWeight: 600 } }, picked.map((p) => h('li', {}, p))));
      }
    }
    const go = button('Pick a number', run, 'primary');
    work.append(h('div', { class: 'panel' }, stage));
    side.append(field('What', kind), numField, diceCount, listField, actions(go));
    show();
  },
});

// ---------- Placeholder text ----------

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');

tool({
  id: 'lorem-ipsum',
  cat: 'generate',
  name: 'Placeholder text',
  desc: 'Lorem ipsum filler text for layouts and mockups.',
  intro: 'Filler text to see how a layout looks before the real words exist.',
  keywords: 'lorem ipsum placeholder dummy filler text',
  mount(root) {
    const { work, side } = layout(root);
    const out = h('div', { class: 'panel', style: { whiteSpace: 'pre-wrap', lineHeight: 1.7 } });
    const unit = segmented([['p', 'Paragraphs'], ['s', 'Sentences'], ['w', 'Words']], 'p', generate, 'Unit');
    const amount = rangeField('Amount', { min: 1, max: 20, value: 3, onInput: generate });
    const classic = checkbox('Start with "Lorem ipsum dolor sit amet"', true, generate);
    const sentence = () => {
      const n = 8 + randomInt(10);
      const w = Array.from({ length: n }, () => randomFrom(LOREM));
      return w.join(' ').replace(/^./, (c) => c.toUpperCase()) + '.';
    };
    const paragraph = () => Array.from({ length: 4 + randomInt(4) }, sentence).join(' ');
    function generate() {
      const n = Number(amount.input.value);
      let text = unit.value === 'p' ? Array.from({ length: n }, paragraph).join('\n\n')
        : unit.value === 's' ? Array.from({ length: n }, sentence).join(' ')
        : Array.from({ length: n }, () => randomFrom(LOREM)).join(' ');
      if (classic.input.checked) {
        const start = 'Lorem ipsum dolor sit amet';
        text = unit.value === 'w' ? start.split(' ').concat(text.split(' ')).slice(0, n).join(' ') : `${start}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
      }
      out.textContent = text;
    }
    work.append(out);
    side.append(field('Unit', unit), amount, classic, actions(
      button('Copy text', () => copyText(out.textContent, 'Text copied'), 'primary'),
      button('New text', generate),
    ));
    generate();
  },
});
