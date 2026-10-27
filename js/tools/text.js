// Text and data tools. Everything updates while you type.

function outputBlock(placeholder = '') {
  const pre = h('div', { class: 'output' }, placeholder);
  const copy = button('Copy', () => copyText(pre.textContent), 'small');
  copy.prepend(h('span', { html: ICON.copy, style: { display: 'contents' } }));
  return { el: h('div', { class: 'field' }, h('div', { class: 'row' }, h('span', { class: 'field-label grow' }, 'Result'), copy), pre), pre, copy };
}

// ---------- Word counter ----------

tool({
  id: 'word-count',
  cat: 'text',
  name: 'Word counter',
  desc: 'Count words, characters, sentences and reading time.',
  intro: 'Paste or type your text. The numbers update as you write.',
  keywords: 'word count characters letters sentences paragraphs reading time essay length',
  mount(root) {
    const { work, side } = layout(root);
    const input = textArea({ placeholder: 'Start typing or paste your text here', spellcheck: true, style: { minHeight: '420px' } });
    const stats = h('div', { class: 'stat-grid' });
    const top = h('table', { class: 'word-table' });
    const topField = field('Most used words', top);

    const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
    const STOP = new Set('the a an and or but of to in on at for with is are was were be it this that as by from i you he she we they not der die das und oder ein eine ist zu mit von den dem des im in auf für nicht es sich auch'.split(' '));
    function update() {
      const text = input.value;
      const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
      const sentences = text.split(/[.!?…]+(?:\s|$)/).filter((s) => s.trim()).length;
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
      const minutes = words.length / 220;
      stats.replaceChildren(
        stat(words.length.toLocaleString('en'), 'words'),
        stat(text.length.toLocaleString('en'), 'characters'),
        stat(text.replace(/\s/g, '').length.toLocaleString('en'), 'without spaces'),
        stat(sentences.toLocaleString('en'), 'sentences'),
        stat(paragraphs.toLocaleString('en'), 'paragraphs'),
        stat(minutes < 1 ? `${Math.ceil(minutes * 60)} s` : `${Math.round(minutes)} min`, 'reading time'),
      );
      const counts = new Map();
      for (const w of words) {
        const k = w.toLowerCase();
        if (k.length > 2 && !STOP.has(k)) counts.set(k, (counts.get(k) || 0) + 1);
      }
      const best = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
      top.replaceChildren(...best.map(([w, n]) => h('tr', {}, h('td', {}, w), h('td', {}, `${n}×`))));
      topField.hidden = !best.length;
    }
    input.addEventListener('input', update);
    work.append(input);
    side.append(stats, topField);
    update();
  },
});

// ---------- Case converter ----------

// Splits on spaces and punctuation, and on camelCase humps like "fooBar"
const words = (s) => s.replace(/([a-z0-9])([A-Z](?=[a-z]))/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const CASES = {
  sentence: ['Sentence case', (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  lower: ['lower case', (s) => s.toLowerCase()],
  upper: ['UPPER CASE', (s) => s.toUpperCase()],
  title: ['Title Case', (s) => s.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  camel: ['camelCase', (s) => s.split('\n').map((l) => words(l).map((w, i) => i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join('')).join('\n')],
  pascal: ['PascalCase', (s) => s.split('\n').map((l) => words(l).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')).join('\n')],
  snake: ['snake_case', (s) => s.split('\n').map((l) => words(l).join('_').toLowerCase()).join('\n')],
  kebab: ['kebab-case', (s) => s.split('\n').map((l) => words(l).join('-').toLowerCase()).join('\n')],
};

tool({
  id: 'case-converter',
  cat: 'text',
  name: 'Change text case',
  desc: 'UPPER, lower, Title Case, camelCase and more.',
  intro: 'Pick a style and copy the result.',
  keywords: 'case upper lower title capital capitalize camel snake kebab convert',
  mount(root) {
    const { work, side } = layout(root);
    const input = textArea({ placeholder: 'Paste your text here' });
    const out = outputBlock();
    const mode = segmented(Object.entries(CASES).map(([k, [label]]) => [k, label]), 'sentence', update, 'Case');
    mode.style.flexDirection = 'column';
    function update() { out.pre.textContent = CASES[mode.value][1](input.value); }
    input.addEventListener('input', update);
    work.append(input, out.el);
    side.append(field('Change to', mode));
    update();
  },
});

// ---------- Compare texts ----------

function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  if (n * m > 9e6) throw new Error('These texts are too long to compare here');
  // Longest common subsequence table, filled from the end
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(['same', A[i]]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push(['del', A[i++]]);
    else out.push(['add', B[j++]]);
  }
  while (i < n) out.push(['del', A[i++]]);
  while (j < m) out.push(['add', B[j++]]);
  return out;
}

tool({
  id: 'text-diff',
  cat: 'text',
  name: 'Compare texts',
  desc: 'See which lines changed between two versions.',
  intro: 'Paste the old version on the left and the new one on the right.',
  keywords: 'diff compare difference changes versions text',
  mount(root) {
    const { work } = layout(root, { side: false });
    const a = textArea({ placeholder: 'Old version' });
    const b = textArea({ placeholder: 'New version' });
    const summary = h('p', { class: 'note' });
    const result = h('div', { class: 'diff' });
    const onlyChanges = checkbox('Only show changed lines', false, update);
    function update() {
      if (!a.value && !b.value) { result.hidden = true; summary.textContent = 'Changes show up here.'; return; }
      try {
        const d = diffLines(a.value, b.value);
        const added = d.filter((x) => x[0] === 'add').length, removed = d.filter((x) => x[0] === 'del').length;
        summary.textContent = !added && !removed ? 'Both texts are the same.' : `${plural(added, 'line')} added, ${plural(removed, 'line')} removed.`;
        result.hidden = false;
        result.replaceChildren(...d.filter((x) => !onlyChanges.input.checked || x[0] !== 'same').map(([type, line]) => h('div', { class: type }, line || ' ')));
      } catch (err) { summary.textContent = err.message; }
    }
    const run = debounce(update, 150);
    a.addEventListener('input', run);
    b.addEventListener('input', run);
    work.append(h('div', { class: 'two-up' }, field('Old', a), field('New', b)), h('div', { class: 'row' }, h('div', { class: 'grow' }, summary), onlyChanges), result);
    update();
  },
});

// ---------- JSON ----------

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

tool({
  id: 'json-formatter',
  cat: 'text',
  name: 'Format JSON',
  desc: 'Make JSON readable, check it for errors or minify it.',
  intro: 'Paste JSON. It gets checked and formatted while you type.',
  keywords: 'json format pretty print beautify validate minify lint',
  mount(root) {
    const { work, side } = layout(root);
    const input = textArea({ class: 'input is-code', placeholder: '{"paste": "your JSON here"}' });
    const out = outputBlock();
    const error = h('div', { class: 'error-box', hidden: true });
    const indent = segmented([['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab'], ['min', 'Minify']], '2', update, 'Indent');
    const sort = checkbox('Sort keys A to Z', false, update);
    const save = button('Download .json', () => downloadBlob(new Blob([out.pre.textContent], { type: 'application/json' }), 'data.json'));
    function update() {
      error.hidden = true;
      if (!input.value.trim()) { out.el.hidden = true; save.disabled = true; return; }
      try {
        let data = JSON.parse(input.value);
        if (sort.input.checked) data = sortKeys(data);
        const ind = indent.value === 'min' ? undefined : indent.value === 'tab' ? '\t' : Number(indent.value);
        out.pre.textContent = JSON.stringify(data, null, ind);
        out.el.hidden = false;
        save.disabled = false;
      } catch (err) {
        // Turn "position 42" into a line and column people can find
        const pos = Number(err.message.match(/position (\d+)/)?.[1]);
        let where = '';
        if (!isNaN(pos)) {
          const before = input.value.slice(0, pos).split('\n');
          where = ` Line ${before.length}, column ${before.at(-1).length + 1}.`;
        }
        error.textContent = `This is not valid JSON.${/line \d/i.test(err.message) ? '' : where} ${err.message}`;
        error.hidden = false;
        out.el.hidden = true;
        save.disabled = true;
      }
    }
    input.addEventListener('input', debounce(update, 120));
    work.append(input, error, out.el);
    side.append(field('Indent', indent), sort, actions(save));
    update();
  },
});

// ---------- Base64 ----------

const bytesToBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const base64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')), (c) => c.charCodeAt(0));

tool({
  id: 'base64',
  cat: 'text',
  name: 'Base64',
  desc: 'Encode or decode Base64 text, or turn a file into a data URL.',
  intro: 'Type on either side. Drop a file to get it as Base64.',
  keywords: 'base64 encode decode data url uri file btoa atob',
  mount(root) {
    const { work, side } = layout(root);
    const plain = textArea({ placeholder: 'Plain text' });
    const encoded = textArea({ class: 'input is-code', placeholder: 'Base64' });
    const error = h('div', { class: 'error-box', hidden: true });
    const urlSafe = checkbox('URL-safe (- and _ instead of + and /)', false, () => encode());
    function encode() {
      error.hidden = true;
      let b = bytesToBase64(new TextEncoder().encode(plain.value));
      if (urlSafe.input.checked) b = b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      encoded.value = b;
    }
    function decode() {
      error.hidden = true;
      try {
        plain.value = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(encoded.value.replace(/^data:[^,]*,/, '')));
      } catch {
        error.textContent = 'This is not Base64 text. If it is a file, it can\'t be shown as text.';
        error.hidden = false;
      }
    }
    plain.addEventListener('input', encode);
    encoded.addEventListener('input', decode);

    const zone = dropzone({
      accept: '',
      multiple: false,
      title: 'Drop a file to encode it',
      hint: 'You get a data URL you can paste into HTML or CSS.',
      onFiles: ([file]) => {
        if (file.size > 20 * 1024 * 1024) return toast('Files over 20 MB are too big for this');
        const r = new FileReader();
        r.onload = () => { encoded.value = r.result; plain.value = ''; toast(`${file.name} encoded, ${formatBytes(r.result.length)} of text`); };
        r.readAsDataURL(file);
      },
    });
    zone.classList.add('is-compact');
    work.append(field('Text', plain), field('Base64', encoded), error);
    side.append(urlSafe, zone, actions(button('Copy Base64', () => copyText(encoded.value))));
  },
});

// ---------- URL encode ----------

tool({
  id: 'url-encode',
  cat: 'text',
  name: 'URL encode & decode',
  desc: 'Escape text for links and read the parts of a URL.',
  intro: 'Type on either side. If you paste a full link, its parts are listed below.',
  keywords: 'url encode decode percent escape query string parameters link',
  mount(root) {
    const { work } = layout(root, { side: false });
    const plain = textArea({ placeholder: 'Normal text or link', style: { minHeight: '120px' } });
    const encoded = textArea({ class: 'input is-code', placeholder: 'Encoded%20text', style: { minHeight: '120px' } });
    const parts = h('div', { class: 'list' });
    const partsField = field('Link parts', parts);
    function showParts(text) {
      let u;
      try { u = new URL(text.trim()); } catch { partsField.hidden = true; return; }
      const rows = [['Protocol', u.protocol.replace(':', '')], ['Host', u.host], ['Path', decodeURIComponent(u.pathname)], ...[...u.searchParams].map(([k, v]) => [`?${k}`, v]), ['Fragment', u.hash.slice(1)]].filter((r) => r[1]);
      parts.replaceChildren(...rows.map(([k, v]) => copyRow(v, k)));
      partsField.hidden = false;
    }
    plain.addEventListener('input', () => { encoded.value = encodeURIComponent(plain.value); showParts(plain.value); });
    encoded.addEventListener('input', () => {
      try { plain.value = decodeURIComponent(encoded.value.replace(/\+/g, ' ')); showParts(plain.value); }
      catch { plain.value = ''; }
    });
    work.append(h('div', { class: 'two-up' }, field('Decoded', plain), field('Encoded', encoded)), partsField);
    partsField.hidden = true;
  },
});

// ---------- Hash ----------

function md5(bytes) {
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  const len = bytes.length;
  const n = (((len + 8) >>> 6) + 1) * 64;
  const buf = new Uint8Array(n);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(n - 8, (len * 8) >>> 0, true);
  dv.setUint32(n - 4, Math.floor(len / 2 ** 29), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < n; off += 64) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + dv.getUint32(off + g * 4, true)) | 0;
      A = D; D = C; C = B;
      const s = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
  return toHex(new Uint8Array(out.buffer));
}
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashes(bytes) {
  const out = [['MD5', md5(bytes)]];
  for (const alg of ['SHA-1', 'SHA-256', 'SHA-512']) out.push([alg, toHex(new Uint8Array(await crypto.subtle.digest(alg, bytes)))]);
  return out;
}

tool({
  id: 'hash',
  cat: 'text',
  name: 'Checksums & hashes',
  desc: 'MD5, SHA-1, SHA-256 and SHA-512 of text or a file.',
  intro: 'Check that a download is intact, or hash some text. Paste a checksum to compare.',
  keywords: 'hash checksum md5 sha sha1 sha256 sha512 verify integrity file',
  mount(root) {
    const { work, side } = layout(root);
    const input = textArea({ placeholder: 'Type text to hash, or drop a file', style: { minHeight: '140px' } });
    const rows = h('div', { class: 'list' });
    const compare = textInput({ placeholder: 'Paste a checksum to compare', class: 'input is-code' });
    const verdict = h('p', { class: 'note' });
    let current = [];
    let label = '';
    async function run(bytes) {
      current = await hashes(bytes);
      rows.replaceChildren(h('p', { class: 'note' }, label), ...current.map(([alg, v]) => copyRow(v, alg)));
      check();
    }
    function check() {
      const want = compare.value.trim().toLowerCase();
      if (!want) { verdict.textContent = ''; return; }
      const hit = current.find(([, v]) => v === want);
      verdict.replaceChildren(hit ? h('span', { class: 'better' }, `Matches ${hit[0]}. The file is intact.`) : h('span', { class: 'worse' }, 'No match. The file is different or damaged.'));
    }
    input.addEventListener('input', debounce(() => { label = 'Hashes of the text above'; run(new TextEncoder().encode(input.value)); }, 150));
    compare.addEventListener('input', check);
    const zone = dropzone({
      accept: '',
      multiple: false,
      title: 'Drop a file here',
      hint: 'Large files take a moment.',
      onFiles: async ([file]) => {
        if (file.size > 1024 ** 3) return toast('Files over 1 GB are too big for this');
        label = `Hashes of ${file.name}, ${formatBytes(file.size)}`;
        input.value = '';
        await run(new Uint8Array(await file.arrayBuffer()));
      },
    });
    zone.classList.add('is-compact');
    work.append(input, zone, rows);
    side.append(field('Compare', compare), verdict);
    label = 'Hashes of empty text';
    run(new Uint8Array());
  },
});

// ---------- Lines ----------

tool({
  id: 'clean-lines',
  cat: 'text',
  name: 'Sort & clean up lines',
  desc: 'Sort lists, remove duplicates and empty lines.',
  intro: 'Paste a list, one item per line, and tidy it up.',
  keywords: 'sort lines alphabetical remove duplicates unique empty blank trim shuffle reverse list',
  mount(root) {
    const { work, side } = layout(root);
    const input = textArea({ placeholder: 'One item per line' });
    const out = outputBlock();
    const sort = segmented([['none', 'Keep order'], ['az', 'A to Z'], ['za', 'Z to A'], ['len', 'By length'], ['num', 'Numbers']], 'none', update, 'Sort');
    const trim = checkbox('Trim spaces', true, update);
    const empty = checkbox('Remove empty lines', true, update);
    const dupes = checkbox('Remove duplicates', true, update);
    const ignoreCase = checkbox('Ignore upper/lower case', false, update);
    const summary = h('p', { class: 'note' });
    let shuffled = false;
    const shuffle = button('Shuffle', () => { shuffled = true; update(); shuffled = false; }, 'small');
    const reverse = button('Reverse', () => { input.value = input.value.split('\n').reverse().join('\n'); update(); }, 'small');
    function update() {
      let lines = input.value.split('\n');
      const before = lines.length;
      if (trim.input.checked) lines = lines.map((l) => l.trim());
      if (empty.input.checked) lines = lines.filter((l) => l.trim());
      if (dupes.input.checked) {
        const seen = new Set();
        lines = lines.filter((l) => { const k = ignoreCase.input.checked ? l.toLowerCase() : l; return !seen.has(k) && seen.add(k); });
      }
      const cmp = new Intl.Collator('en', { sensitivity: ignoreCase.input.checked ? 'base' : 'variant', numeric: true }).compare;
      if (sort.value === 'az') lines.sort(cmp);
      if (sort.value === 'za') lines.sort((a, b) => cmp(b, a));
      if (sort.value === 'len') lines.sort((a, b) => a.length - b.length || cmp(a, b));
      if (sort.value === 'num') lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
      if (shuffled) for (let i = lines.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [lines[i], lines[j]] = [lines[j], lines[i]]; }
      out.pre.textContent = lines.join('\n');
      summary.textContent = input.value ? `${plural(before, 'line')} in, ${plural(lines.length, 'line')} out.` : '';
    }
    input.addEventListener('input', update);
    work.append(input, out.el);
    side.append(field('Sort', sort), trim, empty, dupes, ignoreCase, h('div', { class: 'row' }, shuffle, reverse), summary);
    update();
  },
});
