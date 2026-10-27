// Office files. .docx, .xlsx and .pptx are zip archives full of XML, so most of this is unzipping
// and reading. mammoth turns Word into HTML, SheetJS reads spreadsheets.

const WORD_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SHEET_ACCEPT = '.xlsx,.xlsm,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet';
const SLIDES_ACCEPT = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const CSV_ACCEPT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';

// Opens the browser's print dialog for some HTML, where "Save as PDF" is one click away
function printHtml(html, title) {
  const frame = h('iframe', { style: { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' }, 'aria-hidden': 'true' });
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { margin: 2cm; }
    body { font: 11pt/1.55 Georgia, "Times New Roman", serif; color: #111; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; } td, th { border: 1px solid #999; padding: 4px 8px; }
    h1, h2, h3 { font-family: system-ui, sans-serif; line-height: 1.2; }
  </style></head><body>${html}</body></html>`);
  doc.close();
  const go = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  // Wait for embedded images before printing
  const imgs = [...doc.images].filter((i) => !i.complete);
  if (!imgs.length) setTimeout(go, 50);
  else Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(go);
}

// ---------- Word ----------

tool({
  id: 'word-convert',
  cat: 'office',
  name: 'Convert Word documents',
  desc: 'Turn a .docx into PDF, plain text or a web page.',
  intro: 'See your document, then save it as PDF, text or HTML. Fancy layouts (columns, text boxes) come out simpler.',
  keywords: 'word docx document convert pdf text html export',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, html = '', text = '';
    const preview = h('div', { class: 'doc-preview', hidden: true });
    const stats = h('p', { class: 'note' }, 'Add a .docx file to start.');
    const warn = h('p', { class: 'note' });
    const zone = dropzone({
      accept: WORD_ACCEPT,
      multiple: false,
      title: 'Drop a Word file here',
      hint: '.docx files. Old .doc files need to be saved as .docx first.',
      onFiles: async ([f]) => {
        try {
          await need('mammoth');
          const arrayBuffer = await f.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          html = result.value;
          text = (await mammoth.extractRawText({ arrayBuffer })).value;
          file = f;
          preview.innerHTML = html || '<p><em>This document has no text.</em></p>';
          preview.hidden = false;
          const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
          stats.textContent = `${plural(words, 'word')}, ${plural(preview.querySelectorAll('img').length, 'image')}.`;
          warn.textContent = result.messages.length ? 'Some formatting could not be carried over.' : '';
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          update();
        } catch (err) {
          console.error(err);
          toast(`${f.name} could not be read. Is it a .docx file?`);
        }
      },
    });
    const pdf = button('Save as PDF', () => printHtml(html, baseName(file.name)), 'primary');
    const txt = button('Download text', () => downloadBlob(new Blob([text], { type: 'text/plain' }), `${baseName(file.name)}.txt`));
    const web = button('Download HTML', () => downloadBlob(new Blob([`<!doctype html><meta charset="utf-8"><title>${escapeHtml(baseName(file.name))}</title>${html}`], { type: 'text/html' }), `${baseName(file.name)}.html`));
    const copy = button('Copy text', () => copyText(text, 'Text copied'), 'quiet small');
    function update() { [pdf, txt, web, copy].forEach((b) => (b.disabled = !file)); }
    work.append(zone, preview);
    side.append(stats, warn, h('p', { class: 'note' }, 'PDF opens your browser\'s print window. Pick "Save as PDF" there.'), actions(pdf, txt, web, copy));
    update();
  },
});

// ---------- Excel ----------

function sheetTable(ws, maxRows = 200, maxCols = 40) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const cols = Math.min(maxCols, Math.max(0, ...rows.map((r) => r.length)));
  const letters = Array.from({ length: cols }, (_, i) => XLSX.utils.encode_col(i));
  return {
    rows: rows.length,
    cols,
    el: h('table', { class: 'sheet-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), letters.map((l) => h('th', {}, l)))),
      h('tbody', {}, rows.slice(0, maxRows).map((r, i) => h('tr', {}, h('td', {}, i + 1), letters.map((_, c) => h('td', { title: String(r[c] ?? '') }, String(r[c] ?? '')))))),
    ),
  };
}

tool({
  id: 'excel-convert',
  cat: 'office',
  name: 'Excel to CSV or JSON',
  desc: 'Look inside a spreadsheet and export its sheets.',
  intro: 'Works with .xlsx, .xls and .ods. Pick a sheet, see it, and save it as CSV, JSON or a web page.',
  keywords: 'excel xlsx xls ods spreadsheet sheet csv json export convert table',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, wb = null;
    const tableWrap = h('div', { class: 'sheet-wrap', hidden: true });
    const info = h('p', { class: 'note' }, 'Add a spreadsheet to start.');
    const sheetSelect = select([], '', draw);
    const sheetField = field('Sheet', sheetSelect);
    const format = segmented([['csv', 'CSV'], ['json', 'JSON'], ['html', 'HTML']], 'csv', updateLabel, 'Format');
    const zone = dropzone({
      accept: SHEET_ACCEPT,
      multiple: false,
      title: 'Drop a spreadsheet here',
      hint: '.xlsx, .xls or .ods',
      onFiles: async ([f]) => {
        try {
          await need('xlsx');
          wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
          file = f;
          sheetSelect.replaceChildren(...wb.SheetNames.map((n) => h('option', { value: n }, n)));
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          draw();
        } catch (err) {
          console.error(err);
          toast(`${f.name} could not be read as a spreadsheet`);
        }
      },
    });
    const exportSheet = (name) => {
      const ws = wb.Sheets[name];
      if (format.value === 'json') return new Blob([JSON.stringify(XLSX.utils.sheet_to_json(ws, { defval: null }), null, 2)], { type: 'application/json' });
      if (format.value === 'html') return new Blob([XLSX.utils.sheet_to_html(ws)], { type: 'text/html' });
      return new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' });   // BOM so Excel reads umlauts right
    };
    const fileName = (sheet) => `${baseName(file.name)}${wb.SheetNames.length > 1 ? '-' + sheet.replace(/[\\/:*?"<>|]/g, '-') : ''}.${format.value}`;
    const go = button('Download sheet', () => downloadBlob(exportSheet(sheetSelect.value), fileName(sheetSelect.value)), 'primary');
    const all = button('Download all sheets (zip)', () => busy(all, () => downloadZip(wb.SheetNames.map((n) => ({ name: fileName(n), blob: exportSheet(n) })), `${baseName(file.name)}.zip`)));

    function draw() {
      if (!wb) { go.disabled = all.disabled = true; sheetField.hidden = true; all.hidden = true; return; }
      const t = sheetTable(wb.Sheets[sheetSelect.value]);
      tableWrap.replaceChildren(t.el);
      tableWrap.hidden = false;
      info.textContent = `${plural(t.rows, 'row')}, ${plural(t.cols, 'column')}${t.rows > 200 ? '. Showing the first 200 rows.' : '.'}`;
      sheetField.hidden = wb.SheetNames.length < 2;
      all.hidden = wb.SheetNames.length < 2;
      go.disabled = all.disabled = false;
      updateLabel();
    }
    function updateLabel() { go.textContent = `Download as ${format.value.toUpperCase()}`; }
    work.append(zone, tableWrap);
    side.append(info, sheetField, field('Format', format, { hint: 'CSV opens in any spreadsheet app. JSON is for code.' }), actions(go, all));
    draw();
  },
});

// CSV with quoted fields ("a ""quote"" here", line breaks inside quotes)
function parseDelimited(text, sep) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "1.234,5" (German) or "1,234.5" (English) → 1234.5; anything else stays text
function toNumber(cell, decimal) {
  const s = cell.trim();
  const re = decimal === ',' ? /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/ : /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;
  if (!re.test(s)) return cell;
  return Number(decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
}

tool({
  id: 'csv-to-excel',
  cat: 'office',
  name: 'CSV to Excel',
  desc: 'Turn CSV files into a real .xlsx workbook.',
  intro: 'Each CSV becomes a sheet. Separators (comma, semicolon, tab) are detected for you.',
  keywords: 'csv tsv to excel xlsx spreadsheet convert workbook',
  mount(root) {
    const { work, side } = layout(root);
    let sheets = [];
    const preview = h('div', { class: 'sheet-wrap', hidden: true });
    const info = h('p', { class: 'note' }, 'Add one or more CSV files.');
    const nameInput = textInput({ value: 'workbook' });
    const zone = dropzone({
      accept: CSV_ACCEPT,
      title: 'Drop CSV files here',
      hint: 'One sheet per file',
      onFiles: async (files) => {
        await need('xlsx');
        for (const f of files) {
          const text = (await f.text()).replace(/^﻿/, '');
          const first = text.split('\n', 1)[0];
          const count = (re) => (first.match(re) || []).length;
          const sep = count(/\t/g) > count(/;/g) && count(/\t/g) > count(/,/g) ? '\t' : count(/;/g) > count(/,/g) ? ';' : ',';
          // Semicolon files come from German Excel, where "1,5" means one and a half
          const rows = parseDelimited(text, sep).map((r) => r.map((cell) => toNumber(cell, sep === ';' ? ',' : '.')));
          sheets.push({ name: baseName(f.name).slice(0, 31), ws: XLSX.utils.aoa_to_sheet(rows) });
        }
        if (sheets.length === 1) nameInput.value = sheets[0].name;
        draw();
      },
    });
    const go = button('Download .xlsx', () => {
      const wb = XLSX.utils.book_new();
      const used = new Set();
      for (const s of sheets) {
        let n = s.name || 'Sheet', i = 2;
        while (used.has(n)) n = `${s.name.slice(0, 28)} ${i++}`;
        used.add(n);
        XLSX.utils.book_append_sheet(wb, s.ws, n);
      }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeName(nameInput.value, 'workbook')}.xlsx`);
    }, 'primary');
    function draw() {
      go.disabled = !sheets.length;
      if (!sheets.length) return;
      const t = sheetTable(sheets[0].ws, 50);
      preview.replaceChildren(t.el);
      preview.hidden = false;
      info.textContent = `${plural(sheets.length, 'sheet')}. Preview of "${sheets[0].name}", ${plural(t.rows, 'row')}.`;
      zone.compact(true, 'Add more CSV files');
    }
    work.append(zone, preview);
    side.append(info, field('File name', nameInput), actions(go));
    draw();
  },
});

// ---------- PowerPoint ----------

const xmlText = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.getElementsByTagNameNS('*', 'p')]
    .map((p) => [...p.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join(''))
    .filter((s) => s.trim());
};
const byNumber = (a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]);

tool({
  id: 'slides-text',
  cat: 'office',
  name: 'Get text from slides',
  desc: 'Pull all text and speaker notes out of a PowerPoint.',
  intro: 'Every slide\'s text in order, with speaker notes if you want them. Handy for handouts or search.',
  keywords: 'powerpoint pptx slides presentation text notes extract export',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, slides = [];
    const list = h('div', { class: 'slide-list' });
    const notes = checkbox('Include speaker notes', true, draw);
    const info = h('p', { class: 'note' }, 'Add a .pptx file to start.');
    const zone = dropzone({
      accept: SLIDES_ACCEPT,
      multiple: false,
      title: 'Drop a PowerPoint here',
      hint: '.pptx files',
      onFiles: async ([f]) => {
        try {
          await need('jszip');
          const zip = await JSZip.loadAsync(f);
          const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber);
          slides = [];
          for (const n of names) {
            const num = n.match(/(\d+)\.xml$/)[1];
            const note = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
            slides.push({
              text: xmlText(await zip.file(n).async('string')),
              // Notes slides repeat the slide number as text; drop lone numbers
              notes: note ? xmlText(await note.async('string')).filter((s) => !/^\d+$/.test(s.trim())) : [],
            });
          }
          file = f;
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          draw();
        } catch (err) {
          console.error(err);
          toast(`${f.name} could not be read. Is it a .pptx file?`);
        }
      },
    });
    const asText = () => slides.map((s, i) => [`Slide ${i + 1}`, ...s.text, ...(notes.input.checked && s.notes.length ? ['', 'Notes:', ...s.notes] : [])].join('\n')).join('\n\n');
    const asMarkdown = () => slides.map((s, i) => [`## Slide ${i + 1}`, '', ...s.text.map((t, j) => j === 0 ? `**${t}**` : `- ${t}`), ...(notes.input.checked && s.notes.length ? ['', ...s.notes.map((n) => `> ${n}`)] : [])].join('\n')).join('\n\n');
    const go = button('Download text', () => downloadBlob(new Blob([asText()], { type: 'text/plain' }), `${baseName(file.name)}.txt`), 'primary');
    const md = button('Download Markdown', () => downloadBlob(new Blob([asMarkdown()], { type: 'text/markdown' }), `${baseName(file.name)}.md`));
    const copy = button('Copy all', () => copyText(asText(), 'Text copied'), 'quiet small');
    function draw() {
      [go, md, copy].forEach((b) => (b.disabled = !file));
      if (!file) return;
      const words = asText().match(/[\p{L}\p{N}]+/gu)?.length || 0;
      info.textContent = `${plural(slides.length, 'slide')}, ${plural(words, 'word')}.`;
      list.replaceChildren(...slides.map((s, i) => h('div', { class: 'slide-item' },
        h('b', {}, `Slide ${i + 1}`),
        s.text.length ? s.text.map((t) => h('p', {}, t)) : h('p', { class: 'faint' }, 'No text on this slide'),
        notes.input.checked && s.notes.length ? h('div', { class: 'notes' }, s.notes.join('\n')) : null,
      )));
    }
    work.append(zone, list);
    side.append(info, notes, actions(go, md, copy));
    draw();
  },
});

// ---------- Images inside Office files ----------

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' };

tool({
  id: 'office-images',
  cat: 'office',
  name: 'Extract images',
  desc: 'Save every picture from a Word, Excel or PowerPoint file.',
  intro: 'Gets the original pictures out of the file, in full quality.',
  keywords: 'extract images pictures photos from word excel powerpoint docx pptx xlsx odt media',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, images = [];
    const grid = h('div', { class: 'media-grid' });
    const info = h('p', { class: 'note' }, 'Add a Word, Excel or PowerPoint file.');
    const zone = dropzone({
      accept: `${WORD_ACCEPT},${SHEET_ACCEPT},${SLIDES_ACCEPT},.odt,.odp`,
      multiple: false,
      title: 'Drop an Office file here',
      hint: '.docx, .pptx, .xlsx, .odt or .odp',
      onFiles: async ([f]) => {
        try {
          await need('jszip');
          const zip = await JSZip.loadAsync(f);
          images.forEach((i) => URL.revokeObjectURL(i.url));
          images = [];
          for (const name of Object.keys(zip.files).filter((n) => /(^|\/)(media|Pictures)\/[^/]+\.\w+$/i.test(n)).sort()) {
            const ext = name.split('.').pop().toLowerCase();
            if (!IMAGE_TYPES[ext]) continue;
            const blob = new Blob([await zip.file(name).async('arraybuffer')], { type: IMAGE_TYPES[ext] });
            images.push({ name: name.split('/').pop(), blob, url: URL.createObjectURL(blob) });
          }
          file = f;
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          draw();
        } catch (err) {
          console.error(err);
          toast(`${f.name} could not be opened`);
        }
      },
    });
    const go = button('Download all images', () => busy(go, () => images.length === 1 ? downloadBlob(images[0].blob, images[0].name) : downloadZip(images.map((i) => ({ name: i.name, blob: i.blob })), `${baseName(file.name)}-images.zip`)), 'primary');
    function draw() {
      go.disabled = !images.length;
      if (!file) return;
      info.textContent = images.length ? `${plural(images.length, 'image')} found, ${formatBytes(images.reduce((s, i) => s + i.blob.size, 0))}.` : 'This file has no images.';
      go.textContent = images.length > 1 ? `Download ${images.length} images (zip)` : 'Download image';
      grid.replaceChildren(...images.map((i) => h('div', { class: 'media-item' },
        h('img', { src: i.url, alt: '' }),
        h('div', { class: 'row' }, h('span', {}, i.name), iconBtn('download', `Download ${i.name}`, () => downloadBlob(i.blob, i.name))),
      )));
    }
    work.append(zone, grid);
    side.append(info, h('p', { class: 'note' }, 'Some pictures (EMF, WMF) are Windows drawings your browser can\'t show, but they are still saved.'), actions(go));
    draw();
    return () => images.forEach((i) => URL.revokeObjectURL(i.url));
  },
});
