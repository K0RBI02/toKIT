// toKIT canvas: a camera over one big sheet of grid paper, like k0rbi02.github.io.
//
//   overview   free space left, terminal top right, headline bottom right (zoomed out)
//   options    #/open: zoomed in on the free space, which shows what you can do with the file
//   tool       #/<tool-id>: the camera moves past the terminal to the tool on its right

const $ = (sel) => document.querySelector(sel);
const world = $('#world');
const gridFine = $('#grid-fine');
const gridCoarse = $('#grid-coarse');
const terminal = $('#terminal');
const termBody = $('#terminal-body');
const title = $('#big-title');
const optionsEl = $('#options');
const toolEl = $('#tool');
const zoomPill = $('#zoom-pill');
const backPill = $('#back-pill');

const GRID = 32;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let files = [];        // what the visitor dropped; every tool they open gets these
let view = 'overview';
let cleanup = null;
let L = null;          // layout in world pixels

// ---------- Layout ----------
// At zoom 100 % one world pixel is one screen pixel, so options and tools are laid out at real size.

// The overview is a composed screen at zoom S0: terminal in the top right corner, headline in the
// bottom right corner, free space on the left. Zooming in to 100 % on that free space shows the options.
function computeLayout() {
  const W = innerWidth, H = innerHeight;
  const wide = W >= 760;
  const m = wide ? Math.round(clamp(W * 0.03, 24, 48)) : 16;
  const hud = 72;
  const regionH = H - 2 * m - hud;
  const S0 = wide ? 0.62 : 0.78;
  let T, O, R;
  if (wide) {
    const tw = Math.round(clamp(W * 0.34, 360, 560));
    T = { x: 0, y: 0, w: tw, h: Math.round(tw * 0.64) };
    const sideW = W - 3 * m - tw;
    O = { x: -m - sideW, y: 0, w: sideW, h: regionH };
    R = { x: tw + m, y: 0, w: sideW, h: regionH };
  } else {
    const tw = W - 2 * m;
    T = { x: 0, y: 0, w: tw, h: Math.round(Math.min(tw * 0.62, 230)) };
    O = { x: 0, y: T.h + 2 * m, w: tw, h: H - T.h - 4 * m - hud };
    R = { x: 0, y: H + 2 * m, w: tw, h: regionH };
  }
  L = { W, H, m, hud, wide, T, O, R, S0 };

  const place = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  place(terminal, T);
  place(optionsEl, O);
  place(toolEl, R);

  // Overview camera: the terminal's top right corner sits in the screen's top right corner
  L.overview = { cx: T.x + T.w - (W / 2 - m) / S0, cy: T.y + (H / 2 - m) / S0, s: S0 };

  // Headline: as big as fits between the terminal and the HUD, its bottom right in the screen's corner
  title.style.fontSize = '100px';
  const unitW = title.offsetWidth / 100, unitH = title.offsetHeight / 100;
  const roomH = (H - hud - m - (m + T.h * S0 + m * 1.5)) / S0;
  const roomW = (W * (wide ? 0.58 : 1) - 2 * m) / S0;
  const F = Math.floor(Math.min(roomH / unitH, roomW / unitW));
  title.style.fontSize = `${F}px`;
  const tw = title.offsetWidth, th = title.offsetHeight;
  const bottom = L.overview.cy + (H / 2 - hud - m) / S0;
  L.title = { x: T.x + T.w - tw, y: bottom - th, w: tw, h: th };
  Object.assign(title.style, { left: `${L.title.x}px`, top: `${L.title.y}px` });

  sizeCards();
}

function viewTarget(name) {
  const { W, H, m, T, O, R } = L;
  if (name === 'options') return { cx: (L.wide ? O.x : T.x) - m + W / 2, cy: -m + H / 2, s: 1 };
  if (name === 'tool') return { cx: (L.wide ? T.x : R.x) - m + W / 2, cy: R.y - m + H / 2, s: 1 };
  return L.overview;
}

// ---------- Camera ----------

const cam = { cx: 0, cy: 0, s: 1 };
let goal = null;
let moving = false;

function applyCamera() {
  const { W, H } = L;
  world.style.transform = `translate(${W / 2}px, ${H / 2}px) scale(${cam.s.toFixed(4)}) translate(${(-cam.cx).toFixed(2)}px, ${(-cam.cy).toFixed(2)}px)`;
  // The grid follows the camera; below ~70 % a coarser grid takes over so cells never get tiny
  const ox = W / 2 - cam.cx * cam.s - 1, oy = H / 2 - cam.cy * cam.s - 1;
  [[gridFine, GRID], [gridCoarse, GRID * 2]].forEach(([el, size]) => {
    const px = size * cam.s;
    el.style.backgroundSize = `${px.toFixed(2)}px ${px.toFixed(2)}px`;
    el.style.backgroundPosition = `${(ox % px).toFixed(2)}px ${(oy % px).toFixed(2)}px`;
  });
  const coarse = clamp((1 - cam.s) / 0.3, 0, 1);
  gridFine.style.opacity = (1 - coarse).toFixed(3);
  gridCoarse.style.opacity = coarse.toFixed(3);
  zoomPill.textContent = `${Math.round(cam.s * 100)}%`;
}

function flyTo(target, instant = reduceMotion) {
  goal = target;
  if (instant) {
    Object.assign(cam, target);
    applyCamera();
    return;
  }
  if (moving) return;
  moving = true;
  let last = performance.now();
  (function tick(now) {
    // Ease out, zooming on a log scale so zoom in and zoom out feel the same
    const k = 1 - Math.pow(1 - 0.075, Math.min(4, (now - last) / 16.7));
    last = now;
    cam.s = Math.exp(Math.log(cam.s) + (Math.log(goal.s) - Math.log(cam.s)) * k);
    cam.cx += (goal.cx - cam.cx) * k;
    cam.cy += (goal.cy - cam.cy) * k;
    const done = Math.abs(cam.s - goal.s) < 0.0005 && Math.abs(cam.cx - goal.cx) < 0.3 && Math.abs(cam.cy - goal.cy) < 0.3;
    if (done) Object.assign(cam, goal);
    applyCamera();
    if (done) moving = false;
    else requestAnimationFrame(tick);
  })(last);
}

function show(name, instant) {
  view = name;
  document.body.dataset.view = name;
  title.style.opacity = name === 'overview' ? 1 : 0;
  optionsEl.style.opacity = name === 'overview' ? 0 : 1;
  optionsEl.inert = name !== 'options';
  toolEl.inert = name !== 'tool';
  backPill.hidden = name === 'overview';
  backPill.querySelector('span').textContent = name === 'tool' && files.length ? 'other options' : 'start over';
  if (name !== 'tool') activeDrop = terminalDrop;
  flyTo(viewTarget(name), instant);
}

// ---------- Terminal ----------

const PROMPT = '<span class="t-user">you@tokit</span>:<span class="t-path">~</span>$ ';
const cursor = h('span', { class: 'cursor' });
let typing = Promise.resolve();

function line(html = '') {
  const el = h('div', { html });
  termBody.append(el);
  while (termBody.children.length > 40) termBody.firstElementChild.remove();
  return el;
}
const sleep = (ms) => reduceMotion ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// Queue terminal output so lines never interleave
function say(fn) {
  typing = typing.then(fn).catch(console.error);
  return typing;
}
async function command(text) {
  cursor.remove();
  const el = line(PROMPT);
  const span = h('span', {});
  el.append(span, cursor);
  for (const ch of text) {
    span.textContent += ch;
    await sleep(text.length > 30 ? 12 : 28);
  }
  await sleep(120);
  cursor.remove();
}
function ready() {
  cursor.remove();
  line(PROMPT).append(cursor);
}
const log = (html, cls = 't-dim') => say(async () => {
  cursor.remove();
  line(`<span class="${cls}">${html}</span>`);
  ready();
});

function intro() {
  say(async () => {
    await sleep(500);
    await command('tokit');
    line('<span class="t-dim">drop a file here, or anywhere on the page.</span>');
    line('<span class="t-dim">or click this window to pick one.</span>');
    line('<span class="t-dim">pdf, images and text files work today.</span>');
    ready();
  });
}

// Everything a tool saves shows up in the terminal too
const saveBlob = downloadBlob;
downloadBlob = (blob, name) => {
  saveBlob(blob, name);
  log(`saved <span class="t-file">${escapeHtml(name)}</span>, ${formatBytes(blob.size)}`, 't-ok');
};

// ---------- Files in, options out ----------

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|xml|html?|css|js|ts|ya?ml|ini|conf|env|sql)$/i;
const kindOf = (f) => isPdf(f) ? 'pdf' : f.type.startsWith('image/') ? 'image' : (f.type.startsWith('text/') || TEXT_EXT.test(f.name) || f.type === 'application/json') ? 'text' : 'other';
const KIND_NAME = { pdf: 'pdf', image: 'image', text: 'text', other: 'file' };

function suggest(list) {
  const kinds = new Set(list.map(kindOf));
  const one = list.length === 1;
  if (kinds.size === 1 && kinds.has('pdf')) {
    return one ? ['organize-pdf', 'split-pdf', 'extract-pages', 'pdf-to-images', 'merge-pdf', 'hash']
      : ['merge-pdf', 'organize-pdf'];
  }
  if (kinds.size === 1 && kinds.has('image')) {
    const metadata = list.every((f) => /image\/(jpeg|png|webp)/.test(f.type)) ? ['remove-metadata'] : [];
    return one ? ['compress-image', 'resize-image', 'convert-image', 'crop-image', ...metadata, 'images-to-pdf']
      : ['compress-image', 'resize-image', 'convert-image', 'images-to-pdf', ...metadata];
  }
  if ([...kinds].every((k) => k === 'pdf' || k === 'image')) return ['merge-pdf'];
  if (kinds.size === 1 && kinds.has('text')) {
    const json = list.some((f) => /\.json$/i.test(f.name) || f.type === 'application/json') ? ['json-formatter'] : [];
    const diff = list.length === 2 ? ['text-diff'] : [];
    return [...diff, ...json, 'word-count', 'case-converter', 'clean-lines', 'base64', 'hash'];
  }
  return ['hash', 'base64'];
}
let suggestions = [];

async function openFiles(list) {
  if (!list.length) return;
  files = [...list];
  suggestions = suggest(files);
  const first = files[0];
  const kinds = [...new Set(files.map(kindOf))];
  say(async () => {
    await command(`tokit open ${files.length === 1 ? quoteName(first.name) : `${files.length} files`}`);
    for (const f of files.slice(0, 5)) {
      let extra = '';
      if (kindOf(f) === 'pdf') {
        try { extra = `, ${plural((await openPdf(f)).pageCount, 'page')}`; } catch { extra = ', can\'t read it'; }
      }
      line(`  <span class="t-file">${escapeHtml(f.name)}</span>  <span class="t-dim">${KIND_NAME[kindOf(f)]}${extra}, ${formatBytes(f.size)}</span>`);
    }
    if (files.length > 5) line(`  <span class="t-dim">and ${files.length - 5} more</span>`);
    if (kinds.includes('other')) line('<span class="t-dim">word, excel, powerpoint and audio get more tools later.</span>');
    line(`<span class="t-ok">${plural(suggestions.length, 'thing')} you can do. pick one ${L.wide ? 'on the left' : 'below'}.</span>`);
    ready();
  });
  drawOptions();
  if (location.hash === '#/open') show('options');
  else location.hash = '#/open';
}
const quoteName = (n) => /\s/.test(n) ? `"${n}"` : n;

function drawOptions() {
  const tools = suggestions.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean);
  const first = files[0];
  optionsEl.replaceChildren(
    h('div', { class: 'options-head' },
      h('h2', {}, files.length === 1 ? first.name : plural(files.length, 'file')),
      h('p', {}, 'what should happen with it?'),
    ),
    h('div', { class: 'cards' }, tools.map((t) => {
      const cat = categoryOf(t);
      return h('a', { class: 'card', href: `#/${t.id}` },
        h('div', { class: `tile tile--${cat.color}`, html: TOOL_ICONS[t.id] || cat.icon, style: { '--tile-bg': `var(--${cat.color})` } }),
        h('span', { class: 'card-label' }, t.name),
      );
    })),
  );
  sizeCards();
}

// Cards as big as the free space allows, wrapping into rows when there are many
function sizeCards() {
  const cards = optionsEl.querySelector('.cards');
  if (!cards || !L) return;
  const n = cards.children.length;
  const head = optionsEl.querySelector('.options-head');
  const w = L.O.w, hAvail = L.O.h - head.offsetHeight - 32;
  let best = 0, bestCols = 1;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byW = w / (cols + (cols - 1) * 0.16);
    const byH = (hAvail - rows * 40) / (rows + (rows - 1) * 0.18);
    const size = Math.min(byW, byH, 190);
    if (size > best) { best = size; bestCols = cols; }
  }
  cards.style.setProperty('--card', `${Math.floor(best)}px`);
  cards.style.setProperty('--cols', bestCols);
}

// ---------- Tools ----------

function openTool(t) {
  const cat = categoryOf(t);
  document.title = `${t.name} · toKIT`;
  const body = h('div', {});
  toolEl.replaceChildren(
    h('header', { class: 'tool-top' },
      h('div', { class: `tile tile--${cat.color}`, html: TOOL_ICONS[t.id] || cat.icon, style: { '--tile-bg': `var(--${cat.color})` } }),
      h('div', {}, h('h1', {}, t.name), h('p', {}, t.intro || t.desc)),
    ),
    body,
  );
  toolEl.scrollTop = 0;
  activeDrop = null;
  cleanup = t.mount(body) || null;
  if (activeDrop === terminalDrop) activeDrop = null;
  if (files.length) handFiles(body);
  say(async () => {
    await command(`tokit ${t.id}${files.length ? ' ' + (files.length === 1 ? quoteName(files[0].name) : `${files.length} files`) : ''}`);
    line(`<span class="t-dim">${L.wide ? 'ready on the right.' : 'ready.'}</span>`);
    ready();
  });
  show('tool');
}

// Pass the dropped files on: tools with a drop zone take them directly, text tools get the text
async function handFiles(body) {
  if (activeDrop) {
    activeDrop.take(files);
    return;
  }
  const areas = [...body.querySelectorAll('textarea:not([readonly])')];
  const texts = files.filter((f) => kindOf(f) === 'text');
  for (const [i, area] of areas.entries()) {
    if (!texts[i]) break;
    area.value = await texts[i].text();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---------- Drop target while no tool is open ----------

const picker = h('input', { type: 'file', multiple: true, hidden: true, onchange: () => { openFiles([...picker.files]); picker.value = ''; } });
document.body.append(picker);
const terminalDrop = { zone: terminal, take: (list) => openFiles([...list]) };
terminal.addEventListener('click', () => picker.click());
terminal.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });

// ---------- Routing ----------

function route(instant = false) {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  if (palette.open) palette.close();
  const id = location.hash.replace(/^#\/?/, '');
  const t = TOOLS.find((x) => x.id === id && !x.href);
  if (t) return openTool(t);
  document.title = 'toKIT';
  if (id === 'open' && files.length) return show('options', instant);
  if (id) history.replaceState(null, '', location.pathname);
  show('overview', instant);
}
addEventListener('hashchange', () => route());

backPill.addEventListener('click', () => {
  if (view === 'tool' && files.length) location.hash = '#/open';
  else {
    files = [];
    suggestions = [];
    if (location.hash) location.hash = '';
    else route();
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && view !== 'overview' && !document.querySelector('dialog[open]')) backPill.click();
});

addEventListener('resize', debounce(() => {
  computeLayout();
  flyTo(viewTarget(view), true);
}, 100));

// ---------- Palette (Ctrl+K): every tool, including the ones without a file ----------

// German search words, so "zusammenfügen" finds the same tool as "merge"
const GERMAN = {
  'merge-pdf': 'zusammenfügen kombinieren verbinden pdfs',
  'organize-pdf': 'seiten drehen sortieren löschen verschieben anordnen',
  'split-pdf': 'teilen aufteilen trennen',
  'extract-pages': 'seiten herausziehen auswählen extrahieren',
  'images-to-pdf': 'bilder fotos scan zu pdf',
  'pdf-to-images': 'pdf zu bild bilder umwandeln',
  'convert-image': 'bild umwandeln konvertieren format',
  'resize-image': 'bild verkleinern vergrößern größe ändern skalieren',
  'compress-image': 'bild komprimieren verkleinern dateigröße',
  'crop-image': 'zuschneiden beschneiden drehen spiegeln',
  'remove-metadata': 'metadaten standort entfernen datenschutz',
  'word-count': 'wörter zählen zeichen zählen lesezeit',
  'case-converter': 'groß klein schreibung großbuchstaben',
  'text-diff': 'vergleichen unterschied texte',
  'json-formatter': 'json formatieren prüfen',
  'base64': 'kodieren dekodieren',
  'url-encode': 'link kodieren dekodieren',
  'hash': 'prüfsumme',
  'clean-lines': 'zeilen sortieren duplikate entfernen liste',
  'password': 'passwort kennwort generator sicher',
  'uuid': 'id eindeutig',
  'color-palette': 'farben farbpalette',
  'random': 'zufall zufallszahl würfel münze losen auslosen',
  'lorem-ipsum': 'blindtext platzhalter',
  'qr': 'qr code',
  'units': 'einheiten umrechnen länge gewicht temperatur',
  'currency': 'währung wechselkurs geld umrechnen',
  'time-zones': 'zeitzone uhrzeit zeit',
  'timestamp': 'zeitstempel datum',
  'number-base': 'binär zahlensystem',
  'color-converter': 'farbe farbcode umrechnen kontrast',
};
const haystack = (t) => `${t.name} ${t.desc} ${t.keywords || ''} ${GERMAN[t.id] || ''} ${categoryOf(t).name}`.toLowerCase();

function findTools(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return TOOLS;
  return TOOLS
    .filter((t) => words.every((w) => haystack(t).includes(w)))
    .sort((a, b) => Number(b.name.toLowerCase().includes(words[0])) - Number(a.name.toLowerCase().includes(words[0])));
}
const hrefOf = (t) => t.href || `#/${t.id}`;

const palette = h('dialog', { class: 'palette', 'aria-label': 'Find a tool' });
const paletteInput = h('input', { type: 'search', placeholder: 'Find a tool', 'aria-label': 'Find a tool', autocomplete: 'off' });
const paletteList = h('ul', {});
palette.append(paletteInput, paletteList);
document.body.append(palette);

let paletteIndex = 0;
function drawPalette() {
  const found = findTools(paletteInput.value);
  paletteIndex = clamp(paletteIndex, 0, Math.max(0, found.length - 1));
  paletteList.replaceChildren(...found.map((t, i) => {
    const cat = categoryOf(t);
    return h('li', {}, h('a', { href: hrefOf(t), class: i === paletteIndex ? 'is-active' : '', onclick: () => palette.close() },
      h('div', { class: `tile tile--${cat.color}`, html: cat.icon }),
      t.name,
      h('span', {}, cat.name),
    ));
  }));
}
paletteInput.addEventListener('input', () => { paletteIndex = 0; drawPalette(); });
paletteInput.addEventListener('keydown', (e) => {
  const links = paletteList.querySelectorAll('a');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    paletteIndex = (paletteIndex + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    drawPalette();
    paletteList.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && links[paletteIndex]) {
    e.preventDefault();
    links[paletteIndex].click();
  }
});
palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
addEventListener('keydown', (e) => {
  const typingInField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typingInField)) {
    e.preventDefault();
    paletteInput.value = '';
    paletteIndex = 0;
    drawPalette();
    palette.showModal();
  }
});

// ---------- Start ----------

document.fonts.ready.then(() => {
  computeLayout();
  route(true);
  if (view === 'overview' && !reduceMotion) {
    // One opening move: start close on the terminal, then pull back to the whole sheet
    const target = viewTarget('overview');
    Object.assign(cam, { cx: L.T.x + L.T.w / 2, cy: L.T.y + L.T.h / 2 + 40, s: Math.min(1, target.s * 1.6) });
    applyCamera();
    setTimeout(() => flyTo(target), 700);
  }
  intro();
});
