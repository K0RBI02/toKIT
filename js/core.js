// Shared pieces for every tool: the registry, DOM helpers, file handling and form controls.
// Nothing here sends your files anywhere.

const TOOLS = [];
const tool = (def) => TOOLS.push(def);

// Hand-drawn doodles, same stroke style as the project icons on k0rbi02.github.io
const DOODLE = (body) => `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const CATEGORIES = [
  {
    id: 'pdf', name: 'PDF', color: 'peach',
    icon: DOODLE(`<path d="M22 8 C 40 9, 52 8, 64 8 L 84 28 C 83 50, 85 72, 84 92 C 62 93, 40 91, 21 92 C 22 70, 20 40, 22 8 Z"/><path d="M64 8 C 63 15, 64 22, 64 28 C 71 29, 78 28, 84 28"/><path d="M33 34 L 50 33" stroke="var(--accent)" stroke-width="8"/><path d="M33 50 L 70 49 M 33 64 L 72 65 M 33 78 L 58 78"/>`),
  },
  {
    id: 'image', name: 'Images', color: 'blue',
    icon: DOODLE(`<path d="M8 16 C 30 14, 70 15, 92 14 C 93 38, 91 62, 92 86 C 70 87, 30 85, 9 86 C 7 62, 9 38, 8 16 Z"/><path d="M10 72 L 34 46 L 52 64 L 64 52 L 90 76"/><circle cx="70" cy="34" r="8" fill="var(--accent)"/>`),
  },
  {
    id: 'office', name: 'Office', color: 'lilac',
    icon: DOODLE(`<path d="M18 8 C 36 9, 52 8, 66 8 L 84 26 C 83 48, 85 70, 84 92 C 62 93, 40 91, 19 92 C 20 70, 18 40, 18 8 Z"/><path d="M66 8 C 65 14, 66 20, 66 26 C 72 27, 78 26, 84 26"/><path d="M30 44 L 38 76 L 50 52 L 62 76 L 70 44" stroke="var(--accent)"/>`),
  },
  {
    id: 'audio', name: 'Audio', color: 'rose',
    icon: DOODLE(`<path d="M8 50 L 18 50 M 26 36 L 26 64 M 36 22 L 36 78 M 46 40 L 46 60 M 56 14 L 56 86 M 66 32 L 66 68 M 76 44 L 76 56 M 84 50 L 92 50"/><path d="M56 14 L 56 86" stroke="var(--accent)"/>`),
  },
  {
    id: 'text', name: 'Text & data', color: 'cream',
    icon: DOODLE(`<path d="M36 14 C 24 14, 26 30, 26 40 C 26 46, 22 50, 14 50 C 22 50, 26 54, 26 60 C 26 70, 24 86, 36 86"/><path d="M64 14 C 76 14, 74 30, 74 40 C 74 46, 78 50, 86 50 C 78 50, 74 54, 74 60 C 74 70, 76 86, 64 86"/><circle cx="50" cy="50" r="6" fill="var(--accent)" stroke="none"/>`),
  },
  {
    id: 'generate', name: 'Generators', color: 'apricot',
    icon: DOODLE(`<path d="M14 22 C 14 16, 18 12, 24 12 C 44 13, 60 11, 78 12 C 84 12, 88 16, 88 22 C 87 44, 89 60, 88 78 C 88 84, 84 88, 78 88 C 58 87, 42 89, 22 88 C 16 88, 12 84, 12 78 C 13 58, 11 42, 14 22 Z"/><circle cx="32" cy="32" r="6" fill="currentColor"/><circle cx="68" cy="32" r="6" fill="currentColor"/><circle cx="50" cy="50" r="7" fill="var(--accent)" stroke="none"/><circle cx="32" cy="68" r="6" fill="currentColor"/><circle cx="68" cy="68" r="6" fill="currentColor"/>`),
  },
  {
    id: 'convert', name: 'Converters', color: 'sage',
    icon: DOODLE(`<path d="M16 34 C 36 35, 56 33, 80 34"/><path d="M66 20 L 82 34 L 66 48"/><path d="M84 66 C 64 65, 44 67, 20 66" stroke="var(--accent)"/><path d="M34 52 L 18 66 L 34 80" stroke="var(--accent)"/>`),
  },
];
const categoryOf = (t) => CATEGORIES.find((c) => c.id === t.cat);

const WRENCH = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--peach, #FFE1CC)"/><g transform="translate(8 8) scale(2)" fill="#FF8A4C" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></g></svg>`;

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 11l6 6 6-6M5 21h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
};

// ---------- DOM ----------

// h('div', { class: 'x', onclick: fn }, child, [children], 'text')
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    }
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  const add = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(add);
    else el.append(child instanceof Node ? child : String(child));
  };
  children.forEach(add);
  return el;
}

const iconBtn = (icon, label, onclick, extra = '') =>
  h('button', { class: `icon-btn ${extra}`, type: 'button', title: label, 'aria-label': label, html: ICON[icon], onclick });

// ---------- Small utilities ----------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const baseName = (name) => name.replace(/\.[^.]+$/, '');
const plural = (n, word, many = word + 's') => `${n.toLocaleString('en')} ${n === 1 ? word : many}`;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// files: [{ name, blob }]; repeated names get a counter so nothing is overwritten
async function downloadZip(files, zipName) {
  await need('jszip');
  const zip = new JSZip();
  const used = new Map();
  for (const { name, blob } of files) {
    const count = used.get(name) || 0;
    used.set(name, count + 1);
    zip.file(count ? name.replace(/(\.[^.]+)?$/, ` (${count})$1`) : name, blob);
  }
  downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName);
}

let toastTimer;
function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3000);
}

async function copyText(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    toast('Copying is blocked here. Select the text and copy it yourself.');
  }
}

// Runs a slow task while the button shows that it is working
async function busy(button, task) {
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    return await task();
  } catch (err) {
    console.error(err);
    toast(err.message || 'That did not work');
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

// ---------- Libraries, loaded only by the tools that need them ----------

const LIBS = {
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdflib: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  sortable: 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  lame: 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js',
  heic: 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  barcode: 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
};

// ES modules, for libraries that only ship that way
const MODULES = {
  gifenc: 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm',
};
const modules = {};
function needModule(name) {
  modules[name] ||= import(MODULES[name]).catch((err) => {
    delete modules[name];
    console.error(err);
    throw new Error('Could not load a part of this tool. Check your connection and try again.');
  });
  return modules[name];
}
const loaded = {};
function need(...names) {
  return Promise.all(names.map((name) => {
    loaded[name] ||= new Promise((resolve, reject) => {
      const s = h('script', { src: LIBS[name] });
      s.onload = () => {
        if (name === 'pdfjs') pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjs.replace('pdf.min.js', 'pdf.worker.min.js');
        resolve();
      };
      s.onerror = () => { delete loaded[name]; reject(new Error('Could not load a part of this tool. Check your connection and try again.')); };
      document.head.append(s);
    });
    return loaded[name];
  }));
}

function sortable(listEl, onSorted) {
  need('sortable').then(() => Sortable.create(listEl, {
    animation: 160,
    handle: listEl.dataset.handle || undefined,
    filter: 'button, input',
    preventOnFilter: false,
    delay: 120,
    delayOnTouchOnly: true,
    onEnd: () => onSorted([...listEl.children].map((el) => el.dataset.key)),
  }));
}

// ---------- Files ----------

// The current tool's drop target. Files dropped or pasted anywhere on the page go there.
let activeDrop = null;

function fileMatches(file, accept) {
  if (!accept) return true;
  return accept.split(',').some((rule) => {
    rule = rule.trim();
    if (rule.endsWith('/*')) return file.type.startsWith(rule.slice(0, -1));
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule);
    return file.type === rule;
  });
}

function dropzone({ accept, multiple = true, title, hint, onFiles }) {
  const input = h('input', { type: 'file', accept, multiple, hidden: true });
  const zone = h('div', { class: 'dropzone', tabindex: 0, role: 'button' },
    h('strong', {}, title),
    h('span', {}, hint),
    input,
  );
  const take = (list) => {
    const files = [...list].filter((f) => fileMatches(f, accept));
    const skipped = list.length - files.length;
    if (skipped) toast(`${plural(skipped, 'file')} skipped, wrong type`);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { take(input.files); input.value = ''; });
  activeDrop = { zone, take };
  // Once files are in, the zone shrinks to an "add more" bar
  zone.compact = (on, label) => {
    zone.classList.toggle('is-compact', on);
    zone.querySelector('strong').textContent = on ? label : title;
  };
  return zone;
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!activeDrop || !e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  activeDrop.zone.classList.add('is-over');
});
window.addEventListener('dragleave', () => {
  if (activeDrop && --dragDepth <= 0) { dragDepth = 0; activeDrop.zone.classList.remove('is-over'); }
});
window.addEventListener('dragover', (e) => { if (activeDrop) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!activeDrop) return;
  e.preventDefault();
  dragDepth = 0;
  activeDrop.zone.classList.remove('is-over');
  if (e.dataTransfer?.files?.length) activeDrop.take(e.dataTransfer.files);
});
window.addEventListener('paste', (e) => {
  if (activeDrop && e.clipboardData?.files?.length) activeDrop.take(e.clipboardData.files);
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} is not an image this browser can open`)); };
    img.src = url;
  });
}
const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// ---------- Layout and controls ----------

// Every tool page has the same shape: work on the left, options and the main action on the right
function layout(root, { side = true } = {}) {
  const work = h('div', { class: 'work' });
  const sideEl = side ? h('aside', { class: 'side' }) : null;
  root.append(h('div', { class: `tool-body ${side ? '' : 'is-single'}` }, work, sideEl));
  return { work, side: sideEl };
}

function actions(...buttons) {
  const hasPrimary = buttons.some((b) => b?.classList.contains('btn--primary'));
  return h('div', { class: `side-actions ${hasPrimary ? 'has-primary' : ''}` }, buttons);
}

const button = (label, onclick, kind = '') =>
  h('button', { class: `btn ${kind ? 'btn--' + kind.split(' ').join(' btn--') : ''}`, type: 'button', onclick }, label);

function field(label, control, { hint, value } = {}) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label, value || null),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

// A row of toggle buttons; returns the element with .value and a change callback
function segmented(options, value, onChange, label) {
  const el = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const set = (v, fire) => {
    el.value = v;
    el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === String(v)));
    if (fire) onChange?.(v);
  };
  for (const opt of options) {
    const [v, text] = Array.isArray(opt) ? opt : [opt, opt];
    el.append(h('button', { type: 'button', 'data-value': v, onclick: () => set(v, true) }, text));
  }
  el.set = set;
  set(value, false);
  return el;
}

function rangeField(label, { min, max, step = 1, value, unit = '', onInput }) {
  const out = h('output', {}, value + unit);
  const input = h('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    out.textContent = input.value + unit;
    onInput?.(Number(input.value));
  });
  const el = field(label, input, { value: out });
  el.input = input;
  return el;
}

const textInput = (attrs = {}) => h('input', { class: 'input', type: 'text', spellcheck: false, ...attrs });
const textArea = (attrs = {}) => h('textarea', { class: 'input', spellcheck: false, ...attrs });

function select(options, value, onChange) {
  const el = h('select', { class: 'input', onchange: () => onChange?.(el.value) },
    options.map((o) => {
      const [v, text] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === value }, text);
    }));
  return el;
}

function checkbox(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onChange?.(input.checked) });
  const el = h('label', { class: 'check' }, input, label);
  el.input = input;
  return el;
}

// A value with a copy button next to it
function copyRow(value, label) {
  const code = h('code', {}, value);
  return h('div', { class: 'copy-row' },
    label ? h('small', {}, label) : null,
    code,
    iconBtn('copy', 'Copy', () => copyText(code.textContent)),
  );
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
