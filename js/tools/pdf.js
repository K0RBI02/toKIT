// PDF tools. pdf-lib writes the files, PDF.js draws the page previews.

const PDF_ACCEPT = 'application/pdf,.pdf';
const IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif';
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

async function openPdf(file) {
  await need('pdfjs');
  const bytes = await file.arrayBuffer();
  try {
    // PDF.js gets its own copy because it hands the buffer to its worker
    const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    return { kind: 'pdf', name: file.name, file, bytes, doc, pageCount: doc.numPages };
  } catch (err) {
    if (err?.name === 'PasswordException') throw new Error(`${file.name} is password protected. Remove the password first.`);
    throw new Error(`${file.name} is not a PDF this tool can read`);
  }
}

// Page previews are drawn one at a time so big PDFs don't freeze the tab
const thumbCache = new WeakMap();
let thumbQueue = Promise.resolve();
function pdfThumb(src, index, size = 240) {
  const cache = thumbCache.get(src) || new Map();
  thumbCache.set(src, cache);
  const key = `${index}:${size}`;
  if (!cache.has(key)) {
    cache.set(key, thumbQueue = thumbQueue.then(async () => {
      const page = await src.doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: size / Math.max(base.width, base.height) });
      const canvas = h('canvas', { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    }).catch(() => '')
    );
  }
  return cache.get(key);
}

// entries: [{ src, index, rotation }] in output order
async function buildPdf(entries, { imageSize = 'fit', margin = 0 } = {}) {
  await need('pdflib');
  const { PDFDocument, degrees } = PDFLib;
  const out = await PDFDocument.create();
  const docs = new Map();
  for (const { src, index, rotation = 0 } of entries) {
    if (src.kind === 'pdf') {
      if (!docs.has(src)) {
        try {
          docs.set(src, await PDFDocument.load(src.bytes, { ignoreEncryption: true }));
        } catch {
          throw new Error(`${src.name} could not be opened for editing`);
        }
      }
      const [page] = await out.copyPages(docs.get(src), [index]);
      page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
      out.addPage(page);
    } else {
      await addImagePage(out, src.file, { imageSize, margin, rotation });
    }
  }
  return new Blob([await out.save()], { type: 'application/pdf' });
}

async function addImagePage(out, file, { imageSize, margin, rotation }) {
  const { degrees } = PDFLib;
  let image;
  if (file.type === 'image/jpeg') image = await out.embedJpg(await file.arrayBuffer());
  else if (file.type === 'image/png') image = await out.embedPng(await file.arrayBuffer());
  else {
    // pdf-lib only takes JPG and PNG, everything else goes through a canvas
    const img = await loadImage(file);
    const canvas = h('canvas', { width: img.naturalWidth, height: img.naturalHeight });
    canvas.getContext('2d').drawImage(img, 0, 0);
    image = await out.embedPng(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
    URL.revokeObjectURL(img.src);
  }
  let w = image.width, h_ = image.height, pageW, pageH;
  if (imageSize === 'fit') {
    pageW = w + margin * 2;
    pageH = h_ + margin * 2;
  } else {
    [pageW, pageH] = PAGE_SIZES[imageSize];
    if (w > h_) [pageW, pageH] = [pageH, pageW];   // wide images get a landscape page
    const scale = Math.min((pageW - margin * 2) / w, (pageH - margin * 2) / h_);
    w *= scale; h_ *= scale;
  }
  const page = out.addPage([pageW, pageH]);
  page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h_) / 2, width: w, height: h_ });
  if (rotation) page.setRotation(degrees(rotation));
}

function imageSource(file) {
  return { kind: 'image', name: file.name, file, url: URL.createObjectURL(file), pageCount: 1 };
}

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

// "1-3, 5, 8-" → [[0,1,2],[4],[7,8,...]] (zero-based); throws with a readable message
function parseRanges(text, pageCount) {
  const groups = [];
  for (const part of text.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*[-–]\s*(\d*)$/) || part.match(/^(\d+)$/);
    if (!m) throw new Error(`"${part}" is not a page or range`);
    const from = Number(m[1] || 1);
    const to = m[2] === undefined ? from : Number(m[2] || pageCount);
    if (from < 1 || to > pageCount || from > to) throw new Error(`"${part}" is outside pages 1 to ${pageCount}`);
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
  }
  return groups;
}

function rangesFrom(indices) {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`);
    i = j;
  }
  return parts.join(', ');
}

function safeName(text, fallback) {
  return (text.trim() || fallback).replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '-');
}

// ---------- Page grid used by organize, extract and PDF → images ----------

function pageGrid({ editable = false, onChange }) {
  const grid = h('div', { class: 'page-grid' });
  let pages = [];
  let nextKey = 1;

  const draw = () => {
    grid.replaceChildren(...pages.map((p, i) => {
      const img = h('img', { alt: '', class: p.rotation % 180 ? 'is-sideways' : '', style: { transform: `rotate(${p.rotation}deg)` } });
      if (p.src.kind === 'image') img.src = p.src.url;
      else pdfThumb(p.src, p.index).then((url) => { img.src = url; });
      return h('div', {
        class: `page ${p.selected ? 'is-selected' : ''}`,
        'data-key': p.key,
        tabindex: 0,
        role: 'checkbox',
        'aria-checked': String(p.selected),
        'aria-label': `Page ${i + 1}`,
      },
        h('div', { class: 'page-paper' }, img),
        h('div', { class: 'page-foot' },
          h('span', { class: 'page-num' }, i + 1),
          editable ? h('span', { class: 'page-tools' },
            iconBtn('rotate', `Rotate page ${i + 1}`, () => { p.rotation = (p.rotation + 90) % 360; draw(); }),
            iconBtn('remove', `Delete page ${i + 1}`, () => { pages = pages.filter((x) => x !== p); draw(); }, 'is-danger'),
          ) : null,
        ),
      );
    }));
    onChange?.();
  };

  const toggle = (el) => {
    const p = pages.find((x) => String(x.key) === el.dataset.key);
    p.selected = !p.selected;
    el.classList.toggle('is-selected', p.selected);
    el.setAttribute('aria-checked', String(p.selected));
    onChange?.();
  };
  grid.addEventListener('click', (e) => {
    const el = e.target.closest('.page');
    if (el && !e.target.closest('button')) toggle(el);
  });
  grid.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('page')) { e.preventDefault(); toggle(e.target); }
  });
  if (editable) sortable(grid, (order) => {
    pages.sort((a, b) => order.indexOf(String(a.key)) - order.indexOf(String(b.key)));
    draw();
  });

  return {
    el: grid,
    get pages() { return pages; },
    set pages(v) { pages = v; draw(); },
    add(src) {
      for (let i = 0; i < src.pageCount; i++) pages.push({ key: nextKey++, src, index: i, rotation: 0, selected: false });
      draw();
    },
    selected: () => pages.filter((p) => p.selected),
    selectWhere(fn) { pages.forEach((p, i) => (p.selected = fn(p, i))); draw(); },
    redraw: draw,
  };
}

// ---------- Merge ----------

tool({
  id: 'merge-pdf',
  cat: 'pdf',
  name: 'Merge PDFs',
  desc: 'Combine several PDFs and images into one file.',
  intro: 'Add PDFs or images, put them in the order you want and get one PDF back.',
  keywords: 'combine join append together bundle',
  mount(root) {
    const { work, side } = layout(root);
    let sources = [];
    let key = 1;

    const list = h('div', { class: 'list', 'data-handle': '.grip' });
    const zone = dropzone({
      accept: `${PDF_ACCEPT},${IMG_ACCEPT}`,
      title: 'Drop PDFs or images here',
      hint: 'or click to choose files. Pasting works too.',
      onFiles: async (files) => {
        for (const file of files) {
          try {
            const src = isPdf(file) ? await openPdf(file) : imageSource(file);
            src.key = String(key++);
            sources.push(src);
          } catch (err) { toast(err.message); }
        }
        if (!nameInput.dataset.touched) nameInput.value = sources.length === 1 ? baseName(sources[0].name) : 'merged';
        draw();
      },
    });
    sortable(list, (order) => { sources.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)); draw(); });

    const summary = h('p', { class: 'note' });
    const nameInput = textInput({ value: 'merged', oninput: () => (nameInput.dataset.touched = '1') });
    const sizeSelect = select([['fit', 'Same size as the image'], ['a4', 'A4'], ['letter', 'Letter']], 'fit');
    const sizeField = field('Pages for images', sizeSelect);
    const go = button('Merge PDF', () => busy(go, async () => {
      const entries = sources.flatMap((src) => Array.from({ length: src.pageCount }, (_, index) => ({ src, index })));
      const blob = await buildPdf(entries, { imageSize: sizeSelect.value, margin: sizeSelect.value === 'fit' ? 0 : 28 });
      downloadBlob(blob, `${safeName(nameInput.value, 'merged')}.pdf`);
      toast(`Merged ${plural(entries.length, 'page')} into one PDF, ${formatBytes(blob.size)}`);
    }), 'primary');

    function draw() {
      list.replaceChildren(...sources.map((src) => {
        const thumb = h('img', { class: 'thumb', alt: '' });
        if (src.kind === 'image') thumb.src = src.url;
        else pdfThumb(src, 0, 120).then((u) => (thumb.src = u));
        return h('div', { class: 'list-item', 'data-key': src.key },
          h('span', { class: 'grip', html: ICON.grip, title: 'Drag to reorder' }),
          thumb,
          h('div', { class: 'meta' },
            h('strong', {}, src.name),
            h('span', {}, src.kind === 'pdf' ? `${plural(src.pageCount, 'page')}, ${formatBytes(src.file.size)}` : `Image, ${formatBytes(src.file.size)}`),
          ),
          iconBtn('remove', `Remove ${src.name}`, () => { sources = sources.filter((s) => s !== src); draw(); }, 'is-danger'),
        );
      }));
      const pages = sources.reduce((n, s) => n + s.pageCount, 0);
      zone.compact(sources.length > 0, 'Add more files');
      summary.textContent = sources.length
        ? `${plural(sources.length, 'file')}, ${plural(pages, 'page')}. Drag the handles to change the order.`
        : 'Add at least one file to start.';
      sizeField.hidden = !sources.some((s) => s.kind === 'image');
      go.disabled = !sources.length;
    }

    work.append(list, zone);
    side.append(summary, field('File name', nameInput), sizeField, actions(go));
    draw();
  },
});

// ---------- Organize ----------

tool({
  id: 'organize-pdf',
  cat: 'pdf',
  name: 'Rotate & reorder pages',
  desc: 'Turn, move or delete pages in a PDF.',
  intro: 'Drag pages to move them, turn the ones that are sideways and delete what you don\'t need.',
  keywords: 'organize rotate turn delete remove reorder sort move pages arrange',
  mount(root) {
    const { work, side } = layout(root);
    let name = 'document';
    const grid = pageGrid({ editable: true, onChange: update });
    const zone = dropzone({
      accept: PDF_ACCEPT,
      title: 'Drop a PDF here',
      hint: 'or click to choose one. More PDFs are added at the end.',
      onFiles: async (files) => {
        for (const file of files) {
          try {
            const src = await openPdf(file);
            if (!grid.pages.length) name = `${baseName(file.name)}-edited`;
            grid.add(src);
          } catch (err) { toast(err.message); }
        }
      },
    });

    const status = h('p', { class: 'note' });
    const rotateSel = button('Rotate selected', () => {
      grid.selected().forEach((p) => (p.rotation = (p.rotation + 90) % 360));
      grid.redraw();
    });
    const deleteSel = button('Delete selected', () => { grid.pages = grid.pages.filter((p) => !p.selected); });
    const clearSel = button('Clear selection', () => grid.selectWhere(() => false), 'quiet small');
    const save = button('Save PDF', () => busy(save, async () => {
      const blob = await buildPdf(grid.pages);
      downloadBlob(blob, `${name}.pdf`);
      toast(`Saved ${plural(grid.pages.length, 'page')}`);
    }), 'primary');

    function update() {
      const n = grid.pages.length, sel = grid.selected().length;
      zone.compact(n > 0, 'Add another PDF');
      status.textContent = !n ? 'Add a PDF to start.'
        : sel ? `${plural(sel, 'page')} selected.` : `${plural(n, 'page')}. Click pages to select several at once.`;
      rotateSel.disabled = deleteSel.disabled = !sel;
      clearSel.hidden = !sel;
      save.disabled = !n;
    }

    work.append(zone, grid.el);
    side.append(status, h('div', { class: 'row' }, rotateSel, deleteSel, clearSel), actions(save));
    update();
  },
});

// ---------- Split ----------

tool({
  id: 'split-pdf',
  cat: 'pdf',
  name: 'Split PDF',
  desc: 'Cut a PDF into single pages or chosen parts.',
  intro: 'Split a PDF into one file per page, into equal parts or by page ranges you type in.',
  keywords: 'split separate cut divide break apart ranges',
  mount(root) {
    const { work, side } = layout(root);
    let src = null;

    const preview = h('div', { class: 'list' });
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([file]) => {
        try { src = await openPdf(file); update(); } catch (err) { toast(err.message); }
      },
    });

    const mode = segmented([['each', 'Every page'], ['every', 'Every N pages'], ['ranges', 'Ranges']], 'each', update, 'How to split');
    const everyInput = h('input', { class: 'input', type: 'number', min: 1, value: 2, oninput: update });
    const rangesInput = textInput({ placeholder: '1-3, 4-6, 7-', oninput: update });
    const everyField = field('Pages per file', everyInput);
    const rangesField = field('Ranges', rangesInput, { hint: 'Each range becomes its own file. "7-" means page 7 to the end.' });
    const error = h('div', { class: 'error-box', hidden: true });
    const go = button('Split PDF', () => busy(go, async () => {
      const groups = plan();
      const files = [];
      for (const [i, group] of groups.entries()) {
        const blob = await buildPdf(group.map((index) => ({ src, index })));
        files.push({ name: `${baseName(src.name)}-${partLabel(group)}.pdf`, blob, i });
      }
      if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
      else await downloadZip(files, `${baseName(src.name)}-split.zip`);
      toast(`Split into ${plural(files.length, 'file')}`);
    }), 'primary');

    const partLabel = (g) => g.length === 1 ? `p${g[0] + 1}` : `p${g[0] + 1}-${g[g.length - 1] + 1}`;

    function plan() {
      const n = src.pageCount;
      if (mode.value === 'each') return Array.from({ length: n }, (_, i) => [i]);
      if (mode.value === 'every') {
        const size = Math.max(1, Math.floor(Number(everyInput.value) || 1));
        return Array.from({ length: Math.ceil(n / size) }, (_, i) => Array.from({ length: Math.min(size, n - i * size) }, (_, j) => i * size + j));
      }
      return parseRanges(rangesInput.value, n);
    }

    function update() {
      everyField.hidden = mode.value !== 'every';
      rangesField.hidden = mode.value !== 'ranges';
      zone.compact(!!src, src ? `${src.name}, ${plural(src.pageCount, 'page')}. Drop another PDF to replace it.` : '');
      error.hidden = true;
      if (!src) { go.disabled = true; preview.replaceChildren(); return; }
      let groups = [];
      try { groups = plan(); } catch (err) { error.textContent = err.message; error.hidden = false; }
      go.disabled = !groups.length;
      go.textContent = groups.length > 1 ? `Split into ${groups.length} files` : 'Split PDF';
      const shown = groups.slice(0, 40);
      preview.replaceChildren(...shown.map((g) => {
        const thumb = h('img', { class: 'thumb', alt: '' });
        pdfThumb(src, g[0], 120).then((u) => (thumb.src = u));
        return h('div', { class: 'list-item' }, thumb, h('div', { class: 'meta' },
          h('strong', {}, `${baseName(src.name)}-${partLabel(g)}.pdf`),
          h('span', {}, g.length === 1 ? `Page ${g[0] + 1}` : `Pages ${g[0] + 1} to ${g[g.length - 1] + 1}`),
        ));
      }), ...(groups.length > shown.length ? [h('p', { class: 'note' }, `and ${groups.length - shown.length} more`)] : []));
    }

    work.append(zone, preview);
    side.append(field('Split into', mode), everyField, rangesField, error, actions(go));
    update();
  },
});

// ---------- Extract ----------

tool({
  id: 'extract-pages',
  cat: 'pdf',
  name: 'Extract pages',
  desc: 'Pull the pages you need into a new PDF.',
  intro: 'Click the pages you want to keep, or type them in. You get a new PDF with only those pages.',
  keywords: 'extract select pick pages save part subset',
  mount(root) {
    const { work, side } = layout(root);
    let src = null;
    const grid = pageGrid({ onChange: () => { if (document.activeElement !== rangesInput) rangesInput.value = rangesFrom(grid.selected().map((p) => p.index)); update(); } });
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([file]) => {
        try {
          src = await openPdf(file);
          grid.pages = [];
          grid.add(src);
        } catch (err) { toast(err.message); }
      },
    });
    const rangesInput = textInput({ placeholder: 'e.g. 1-3, 7' });
    const error = h('div', { class: 'error-box', hidden: true });
    rangesInput.addEventListener('input', () => {
      error.hidden = true;
      try {
        const wanted = new Set(parseRanges(rangesInput.value, src?.pageCount || 0).flat());
        grid.selectWhere((p) => wanted.has(p.index));
      } catch (err) { error.textContent = err.message; error.hidden = false; }
    });
    const all = button('Select all', () => grid.selectWhere(() => true), 'small');
    const none = button('Select none', () => grid.selectWhere(() => false), 'small quiet');
    const go = button('Save pages', () => busy(go, async () => {
      const blob = await buildPdf(grid.selected());
      downloadBlob(blob, `${baseName(src.name)}-pages-${rangesFrom(grid.selected().map((p) => p.index)).replace(/[, ]+/g, '_')}.pdf`);
      toast(`Saved ${plural(grid.selected().length, 'page')}`);
    }), 'primary');

    function update() {
      zone.compact(!!src, src ? `${src.name}. Drop another PDF to replace it.` : '');
      const n = grid.selected().length;
      go.disabled = !n;
      go.textContent = n ? `Save ${plural(n, 'page')} as PDF` : 'Select pages first';
    }

    work.append(zone, grid.el);
    side.append(field('Pages', rangesInput, { hint: 'Clicking pages fills this in for you.' }), error, h('div', { class: 'row' }, all, none), actions(go));
    update();
  },
});

// ---------- Images to PDF ----------

tool({
  id: 'images-to-pdf',
  cat: 'pdf',
  name: 'Images to PDF',
  desc: 'Turn photos or scans into one PDF.',
  intro: 'Add photos or scans, sort them and get one PDF with a page per image.',
  keywords: 'jpg png photo scan picture convert to pdf',
  mount(root) {
    const { work, side } = layout(root);
    let images = [];
    let key = 1;
    const list = h('div', { class: 'list', 'data-handle': '.grip' });
    const zone = dropzone({
      accept: IMG_ACCEPT,
      title: 'Drop images here',
      hint: 'JPG, PNG, WebP and more. Click to choose or paste.',
      onFiles: (files) => {
        images.push(...files.map((f) => Object.assign(imageSource(f), { key: String(key++), rotation: 0 })));
        draw();
      },
    });
    sortable(list, (order) => { images.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)); draw(); });

    const size = segmented([['a4', 'A4'], ['letter', 'Letter'], ['fit', 'Image size']], 'a4', null, 'Page size');
    const margin = segmented([['0', 'None'], ['20', 'Small'], ['48', 'Large']], '20', null, 'Margin');
    const nameInput = textInput({ value: 'images' });
    const go = button('Create PDF', () => busy(go, async () => {
      const blob = await buildPdf(images.map((src) => ({ src, index: 0, rotation: src.rotation })), { imageSize: size.value, margin: Number(margin.value) });
      downloadBlob(blob, `${safeName(nameInput.value, 'images')}.pdf`);
      toast(`Created a PDF with ${plural(images.length, 'page')}, ${formatBytes(blob.size)}`);
    }), 'primary');

    function draw() {
      list.replaceChildren(...images.map((src) => h('div', { class: 'list-item', 'data-key': src.key },
        h('span', { class: 'grip', html: ICON.grip, title: 'Drag to reorder' }),
        h('img', { class: 'thumb', alt: '', src: src.url, style: { transform: `rotate(${src.rotation}deg)` } }),
        h('div', { class: 'meta' }, h('strong', {}, src.name), h('span', {}, formatBytes(src.file.size))),
        iconBtn('rotate', `Rotate ${src.name}`, () => { src.rotation = (src.rotation + 90) % 360; draw(); }),
        iconBtn('remove', `Remove ${src.name}`, () => { URL.revokeObjectURL(src.url); images = images.filter((i) => i !== src); draw(); }, 'is-danger'),
      )));
      zone.compact(images.length > 0, 'Add more images');
      go.disabled = !images.length;
      go.textContent = images.length ? `Create PDF with ${plural(images.length, 'page')}` : 'Create PDF';
    }

    work.append(list, zone);
    side.append(field('Page size', size), field('Margin', margin), field('File name', nameInput), actions(go));
    draw();
  },
});

// ---------- PDF to images ----------

tool({
  id: 'pdf-to-images',
  cat: 'pdf',
  name: 'PDF to images',
  desc: 'Save PDF pages as JPG or PNG.',
  intro: 'Turn every page, or just the ones you pick, into an image.',
  keywords: 'pdf to jpg png image picture export render convert',
  mount(root) {
    const { work, side } = layout(root);
    let src = null;
    const grid = pageGrid({ onChange: update });
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([file]) => {
        try {
          src = await openPdf(file);
          grid.pages = [];
          grid.add(src);
        } catch (err) { toast(err.message); }
      },
    });
    const format = segmented([['image/jpeg', 'JPG'], ['image/png', 'PNG']], 'image/jpeg', null, 'Format');
    const dpi = segmented([['72', 'Screen'], ['150', 'Good'], ['300', 'Print']], '150', null, 'Resolution');
    const status = h('p', { class: 'note' });
    const go = button('Save images', () => busy(go, async () => {
      const chosen = grid.selected().length ? grid.selected() : grid.pages;
      const ext = format.value === 'image/png' ? 'png' : 'jpg';
      const files = [];
      for (const p of chosen) {
        const page = await src.doc.getPage(p.index + 1);
        const viewport = page.getViewport({ scale: Number(dpi.value) / 72 });
        const canvas = h('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        files.push({ name: `${baseName(src.name)}-p${p.index + 1}.${ext}`, blob: await canvasToBlob(canvas, format.value, 0.9) });
      }
      if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
      else await downloadZip(files, `${baseName(src.name)}-images.zip`);
      toast(`Saved ${plural(files.length, 'image')}`);
    }), 'primary');

    function update() {
      zone.compact(!!src, src ? `${src.name}. Drop another PDF to replace it.` : '');
      const n = grid.selected().length || grid.pages.length;
      status.textContent = !src ? 'Add a PDF to start.' : grid.selected().length ? `${plural(n, 'page')} selected.` : 'All pages. Click pages to only save some.';
      go.disabled = !src;
      go.textContent = src ? `Save ${plural(n, 'image')}` : 'Save images';
    }

    work.append(zone, grid.el);
    side.append(status, field('Format', format), field('Quality', dpi, { hint: 'Print quality makes big files.' }), actions(go));
    update();
  },
});
