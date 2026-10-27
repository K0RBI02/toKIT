// toKIT canvas: a camera over one big sheet of grid paper, like k0rbi02.github.io.
//
//   overview   askew and zoomed out: the workflow sketch on the left, terminal top right, headline bottom right
//   options    #/open: the desk straightens out at 100 %, the left half shows what you can do with the file
//   tool       #/<tool-id>: the tool takes the place of the options, the terminal stays on the right

const $ = (sel) => document.querySelector(sel);
const world = $('#world');
const gridFine = $('#grid-fine');
const gridCoarse = $('#grid-coarse');
const terminal = $('#terminal');
const termBody = $('#terminal-body');
const selection = $('#selection');
const title = $('#big-title');
const flow = $('#flow');
const korbi = $('#korbi');
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
// The overview is a composed screen at zoom S0, turned by TILT: terminal in the top right corner,
// headline (kept straight on screen) in the bottom right corner, the workflow sketch on the left.

const deg = Math.PI / 180;

function computeLayout() {
  const W = innerWidth, H = innerHeight;
  const wide = W >= 760;
  const m = wide ? Math.round(clamp(W * 0.03, 24, 48)) : 16;
  const hud = 72;
  const regionH = H - 2 * m - hud;
  const S0 = wide ? 0.78 : 0.8;
  const TILT = (wide ? 3 : 2) * deg;
  let T, O, R, K = 0;
  if (wide) {
    const tw = Math.round(clamp(W * 0.4, 380, 640));
    T = { x: 0, y: 0, w: tw, h: Math.round(tw * 0.64) };
    // Room above the terminal for Korbi to sit on it, as far as the screen allows
    K = Math.round(Math.min(tw * 0.34, regionH - T.h));
    if (K < 90) K = 0;
    const sideW = W - 3 * m - tw;
    O = { x: -m - sideW, y: -K, w: sideW, h: regionH };
    R = O;   // the tool takes the place of the options
  } else {
    const tw = W - 2 * m;
    T = { x: 0, y: 0, w: tw, h: Math.round(Math.min(tw * 0.62, 230)) };
    O = { x: 0, y: T.h + 2 * m, w: tw, h: H - T.h - 4 * m - hud };
    R = { x: 0, y: H + 2 * m, w: tw, h: regionH };
  }
  L = { W, H, m, hud, wide, T, O, R, K, S0, TILT };

  const place = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  place(terminal, T);
  place(selection, T);
  place(optionsEl, O);
  place(toolEl, R);

  // Overview camera: solve for the centre so the terminal's top right corner lands near the screen's
  // top right corner after the turn (its top left corner rises by w·sin, so leave room for that)
  const turn = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const toWorld = (sx, sy, cam) => {
    const [dx, dy] = turn((sx - W / 2) / cam.s, (sy - H / 2) / cam.s, -cam.a);
    return [cam.cx + dx, cam.cy + dy];
  };
  const Q = [W - m, m + T.w * S0 * Math.sin(TILT) + 4];
  const [qx, qy] = turn((Q[0] - W / 2) / S0, (Q[1] - H / 2) / S0, -TILT);
  L.overview = { cx: T.x + T.w - qx, cy: T.y - qy, s: S0, a: TILT };

  // Headline: as big as fits between the terminal and the HUD, straight on screen, bottom right
  title.style.transform = 'none';
  title.style.fontSize = '100px';
  const unitW = title.offsetWidth / 100, unitH = title.offsetHeight / 100;
  const termBottom = Q[1] + T.h * S0 * Math.cos(TILT);
  const roomH = H - hud - m - termBottom - m * 1.5;
  const roomW = W * (wide ? 0.58 : 1) - 2 * m;
  const F = Math.floor(Math.min(roomH / (unitH * S0), roomW / (unitW * S0)));
  title.style.fontSize = `${F}px`;
  const tw = title.offsetWidth, th = title.offsetHeight;
  const [wx, wy] = toWorld(W - m - (tw * S0) / 2, H - hud - m - (th * S0) / 2, L.overview);
  Object.assign(title.style, { left: `${wx - tw / 2}px`, top: `${wy - th / 2}px`, transform: `rotate(${-TILT}rad)` });

  // Workflow sketch: in the free space left of the terminal, level with it
  const fw = Math.min(wide ? (W - 3 * m) / S0 - T.w - m * 2 : T.w, wide ? T.w * 1.15 : T.w);
  Object.assign(flow.style, wide
    ? { left: `${-m * 2 - fw}px`, top: `${T.h * 0.12}px`, width: `${fw}px`, display: '' }
    : { display: 'none' });

  // Korbi sits on the terminal's top edge, a bit right of centre, legs over the edge
  if (K) Object.assign(korbi.style, { height: `${K}px`, left: `${T.x + T.w * 0.56}px`, top: `${T.y - K * 0.9}px`, display: '' });
  else korbi.style.display = 'none';

  sizeCards();
}

function viewTarget(name) {
  const { W, H, m, O, R } = L;
  if (name === 'options' || (name === 'tool' && L.wide)) return { cx: O.x - m + W / 2, cy: (L.wide ? O.y : L.T.y) - m + H / 2, s: 1, a: 0 };
  if (name === 'tool') return { cx: R.x - m + W / 2, cy: R.y - m + H / 2, s: 1, a: 0 };
  return L.overview;
}

// ---------- Camera ----------

const cam = { cx: 0, cy: 0, s: 1, a: 0 };
let goal = null;
let moving = false;

function applyCamera() {
  const { W, H } = L;
  world.style.transform = `translate(${W / 2}px, ${H / 2}px) rotate(${cam.a.toFixed(5)}rad) scale(${cam.s.toFixed(4)}) translate(${(-cam.cx).toFixed(2)}px, ${(-cam.cy).toFixed(2)}px)`;
  world.style.setProperty('--inv', (1 / cam.s).toFixed(4));
  // The grid follows the camera's move and zoom but not its turn, like the portfolio.
  // Below ~70 % a coarser grid takes over so cells never get tiny.
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
    return Promise.resolve();
  }
  if (moving) return moving;
  let resolve;
  moving = new Promise((r) => { resolve = r; });
  const flight = moving;
  {
    let last = performance.now();
    (function tick(now) {
      // Ease out, zooming on a log scale so zoom in and zoom out feel the same; the turn follows along
      const k = 1 - Math.pow(1 - 0.075, Math.min(4, (now - last) / 16.7));
      last = now;
      cam.s = Math.exp(Math.log(cam.s) + (Math.log(goal.s) - Math.log(cam.s)) * k);
      cam.cx += (goal.cx - cam.cx) * k;
      cam.cy += (goal.cy - cam.cy) * k;
      cam.a += (goal.a - cam.a) * k;
      const done = Math.abs(cam.s - goal.s) < 0.0005 && Math.abs(cam.cx - goal.cx) < 0.3 && Math.abs(cam.cy - goal.cy) < 0.3 && Math.abs(cam.a - goal.a) < 0.0002;
      if (done) Object.assign(cam, goal);
      applyCamera();
      if (done) { moving = false; resolve(); }
      else requestAnimationFrame(tick);
    })(last);
  }
  return flight;
}

function show(name, instant) {
  view = name;
  document.body.dataset.view = name;
  optionsEl.inert = name !== 'options';
  toolEl.inert = name !== 'tool';
  backPill.hidden = name === 'overview';
  backPill.querySelector('span').textContent = name === 'tool' && files.length ? 'other options' : 'start over';
  if (name !== 'tool') activeDrop = terminalDrop;
  if (name === 'overview') korbiLeave();
  return flyTo(viewTarget(name), instant);
}

// ---------- Terminal ----------

const PROMPT = '<span class="t-user">you@tokit</span>:<span class="t-path">~</span>$ ';
const cursor = h('span', { class: 'cursor' });
let typing = Promise.resolve();
let hurry = false;     // set by a click or key during the first-visit intro

function line(html = '') {
  const el = h('div', { html });
  termBody.append(el);
  while (termBody.children.length > 40) termBody.firstElementChild.remove();
  return el;
}
const sleep = (ms) => reduceMotion || hurry ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// Queue terminal output so lines never interleave
function say(fn) {
  typing = typing.then(fn).catch(console.error);
  return typing;
}

// The empty prompt waiting at the bottom; the next command is typed into it instead of a new line
let promptEl = null;
async function command(text, speed = 70) {
  cursor.remove();
  const el = promptEl || line(PROMPT);
  promptEl = null;
  const span = h('span', {});
  el.append(span, cursor);
  for (const ch of text) {
    span.textContent += ch;
    await sleep(speed);
  }
  await sleep(speed > 40 ? 350 : 120);
  cursor.remove();
}
function ready() {
  cursor.remove();
  promptEl = line(PROMPT);
  promptEl.append(cursor);
}
// Output appears line by line, with a pause a person can read along with
async function print(html, pause = 450) {
  cursor.remove();
  if (promptEl) { promptEl.remove(); promptEl = null; }
  line(html);
  await sleep(pause);
}
const log = (html, cls = 't-dim') => say(async () => {
  await print(`<span class="${cls}">${html}</span>`, 0);
  ready();
});

const HELP = [
  ['drop a file here, or anywhere on the page.', 700],
  ['or click this window to pick one.', 700],
  ['works with pdf, images, word, excel,', 250],
  ['powerpoint, audio, video and text.', 300],
];
async function printHelp() {
  for (const [text, pause] of HELP) await print(`<span class="t-dim">${text}</span>`, pause);
  ready();
}

// A line of humour now and then, never on every action
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const SAVED_JOKES = [
  'your file never left. promise.',
  'no upload, no account, no nonsense.',
  'that one was easy.',
  'go on, drop another.',
  'done before the kettle boiled.',
];
let saves = 0;

// Everything a tool saves shows up in the terminal too
const saveBlob = downloadBlob;
downloadBlob = (blob, name) => {
  saveBlob(blob, name);
  saves++;
  say(async () => {
    await print(`<span class="t-ok">saved <span class="t-file">${escapeHtml(name)}</span>, ${formatBytes(blob.size)}</span>`, 300);
    if (saves === 1 || Math.random() < 0.3) await print(`<span class="t-dim">${pick(SAVED_JOKES)}</span>`, 0);
    ready();
  });
  korbiArrive();
};

// ---------- Korbi, the guest: sits down on the terminal after your first save ----------

let korbiReady = null;
let korbiHere = false;
function loadKorbi() {
  korbiReady ||= cutOutPose('img/korbi-laptop.webp').then((pose) => { korbi.src = pose.url; }).catch(() => null);
  return korbiReady;
}
async function korbiArrive() {
  if (korbiHere || !L.K || view === 'overview') return;
  korbiHere = true;
  await loadKorbi();
  if (!korbiHere) return;
  korbi.classList.add('is-here');
  say(async () => {
    await print('<span class="t-dim">korbi joined. he likes watching files get fixed.</span>', 0);
    ready();
  });
}
function korbiLeave() {
  korbiHere = false;
  korbi.classList.remove('is-here');
}

// ---------- Files in, options out ----------

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|xml|html?|css|js|ts|ya?ml|ini|conf|env|sql)$/i;
function kindOf(f) {
  const n = f.name.toLowerCase();
  if (isPdf(f)) return 'pdf';
  if (/\.docx$/.test(n)) return 'word';
  if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) return 'excel';
  if (/\.pptx$/.test(n)) return 'slides';
  if (f.type.startsWith('image/')) return 'image';
  if (f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/.test(n)) return 'audio';
  if (f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/.test(n)) return 'video';
  if (f.type.startsWith('text/') || TEXT_EXT.test(n) || f.type === 'application/json') return 'text';
  return 'other';
}
const KIND_NAME = { pdf: 'pdf', word: 'word document', excel: 'spreadsheet', slides: 'presentation', image: 'image', audio: 'audio', video: 'video', text: 'text', other: 'file' };

function suggest(list) {
  const kinds = new Set(list.map(kindOf));
  const one = list.length === 1;
  const only = (k) => kinds.size === 1 && kinds.has(k);
  if (only('pdf')) {
    return one ? ['organize-pdf', 'split-pdf', 'extract-pages', 'pdf-to-images', 'merge-pdf', 'hash']
      : ['merge-pdf', 'organize-pdf'];
  }
  if (only('image')) {
    const metadata = list.every((f) => /image\/(jpeg|png|webp)/.test(f.type)) ? ['remove-metadata'] : [];
    return one ? ['compress-image', 'resize-image', 'convert-image', 'crop-image', ...metadata, 'images-to-pdf']
      : ['compress-image', 'resize-image', 'convert-image', 'images-to-pdf', ...metadata];
  }
  if ([...kinds].every((k) => k === 'pdf' || k === 'image')) return ['merge-pdf'];
  if (only('word')) return ['word-convert', 'office-images', 'hash'];
  if (only('excel')) return ['excel-convert', 'office-images', 'hash'];
  if (only('slides')) return ['slides-text', 'office-images', 'hash'];
  if (only('audio')) return one ? ['audio-trim', 'audio-convert', 'hash'] : ['audio-convert'];
  if (only('video')) return one ? ['video-to-audio', 'audio-trim', 'hash'] : ['video-to-audio'];
  if (only('text')) {
    const json = list.some((f) => /\.json$/i.test(f.name) || f.type === 'application/json') ? ['json-formatter'] : [];
    const csv = list.every((f) => /\.(csv|tsv)$/i.test(f.name)) ? ['csv-to-excel'] : [];
    const diff = list.length === 2 ? ['text-diff'] : [];
    return [...csv, ...diff, ...json, 'word-count', 'case-converter', 'clean-lines', 'base64', 'hash'];
  }
  return ['hash', 'base64'];
}
let suggestions = [];

// The big moment: the file lands in the terminal, then the camera swings over to the options
async function openFiles(list) {
  if (!list.length) return;
  skipIntro();
  files = [...list];
  suggestions = suggest(files);
  const first = files[0];
  const kinds = [...new Set(files.map(kindOf))];
  drawOptions();
  terminal.classList.remove('is-landing');
  void terminal.offsetWidth;   // restart the animation
  terminal.classList.add('is-landing');
  await say(async () => {
    await command(`tokit open ${files.length === 1 ? quoteName(first.name) : `${files.length} files`}`, 22);
    for (const f of files.slice(0, 5)) {
      let extra = '';
      if (kindOf(f) === 'pdf') {
        try { extra = `, ${plural((await openPdf(f)).pageCount, 'page')}`; } catch { extra = ', can\'t read it'; }
      }
      await print(`  <span class="t-file">${escapeHtml(f.name)}</span>  <span class="t-dim">${KIND_NAME[kindOf(f)]}${extra}, ${formatBytes(f.size)}</span>`, 150);
    }
    if (files.length > 5) await print(`  <span class="t-dim">and ${files.length - 5} more</span>`, 150);
    if (kinds.includes('other')) {
      await print('<span class="t-dim">hm. never seen one of these.</span>', 300);
      await print('<span class="t-dim">old .doc or .ppt? save it as .docx or .pptx first.</span>', 300);
    }
    await print(`<span class="t-ok">${plural(suggestions.length, 'thing')} you can do. pick one ${L.wide ? 'on the left' : 'below'}.</span>`, 0);
    ready();
  });
  if (location.hash === '#/open') show('options');
  else location.hash = '#/open';
}
const quoteName = (n) => /\s/.test(n) ? `"${n}"` : n;

const colorOf = (t) => TOOL_COLORS[t.id] || categoryOf(t).color;
const tileFor = (t) => {
  const c = colorOf(t);
  return h('div', { class: `tile tile--${c}`, html: TOOL_ICONS[t.id] || categoryOf(t).icon, style: { '--tile-bg': `var(--${c})` } });
};

function drawOptions() {
  const tools = suggestions.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean);
  const first = files[0];
  optionsEl.replaceChildren(
    h('div', { class: 'options-head' },
      h('h2', {}, files.length === 1 ? first.name : plural(files.length, 'file')),
      h('p', {}, 'what should happen with it?'),
    ),
    h('div', { class: 'cards' }, tools.map((t, i) => h('a', { class: 'card', href: `#/${t.id}`, style: { '--i': i } },
      tileFor(t),
      h('span', { class: 'card-label' }, t.name),
    ))),
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
  document.title = `${t.name} · toKIT`;
  const body = h('div', {});
  toolEl.replaceChildren(
    h('header', { class: 'tool-top' },
      tileFor(t),
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
    await command(`tokit ${t.id}${files.length ? ' ' + (files.length === 1 ? quoteName(files[0].name) : `${files.length} files`) : ''}`, 22);
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
  'word-convert': 'word dokument umwandeln pdf text',
  'excel-convert': 'excel tabelle csv json exportieren',
  'csv-to-excel': 'csv zu excel tabelle',
  'slides-text': 'powerpoint folien text notizen',
  'office-images': 'bilder aus word powerpoint excel herausholen',
  'audio-trim': 'audio schneiden kürzen klingelton musik',
  'audio-convert': 'audio umwandeln musik ton',
  'video-to-audio': 'video zu mp3 ton musik herausholen',
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
// First visit: start at 100 % on the terminal, type, then pull back askew to show the whole sheet.
// Later visits (and reduced motion) start on the overview straight away. Any key, click or drop skips.

const SEEN = 'tokit:seen';
const firstVisit = (() => { try { return !localStorage.getItem(SEEN); } catch { return false; } })();
let introRunning = false;
function skipIntro() {
  if (!introRunning) return;
  introRunning = false;
  hurry = true;
  if (view === 'overview') flyTo(viewTarget('overview'), true);
  typing.then(() => { hurry = false; });
}

function start() {
  computeLayout();
  route(true);
  if (view !== 'overview' || !firstVisit || reduceMotion) {
    say(async () => {
      ready();
      await sleep(700);
      await command('tokit --help');
      await printHelp();
    });
    return;
  }
  try { localStorage.setItem(SEEN, '1'); } catch { /* private mode: the intro just plays again next time */ }
  introRunning = true;
  const { T } = L;
  Object.assign(cam, { cx: T.x + T.w / 2, cy: T.y + T.h / 2, s: 1, a: 0 });
  applyCamera();
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => addEventListener(ev, skipIntro, { once: true, passive: true }));
  say(async () => {
    ready();
    await sleep(400);
    await command('tokit --help', 55);
    if (introRunning) flyTo(viewTarget('overview')).then(() => { introRunning = false; });
    await printHelp();
  });
}

document.fonts.ready.then(() => {
  start();
  // Cut Korbi out in the background so he is ready when you save something
  (window.requestIdleCallback || setTimeout)(() => loadKorbi());
});
