// More PDF tools: sign, page numbers, watermark, shrink, get the text out.

// Renders one page onto a canvas, `width` CSS pixels wide (sharp on high-DPI screens)
async function renderPage(src, index, width) {
  const page = await src.doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr });
  const canvas = h('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
  canvas.style.width = `${width}px`;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// pdf-lib's page with its drawing box, taking the page's own rotation into account:
// returns a function that maps "as seen" coordinates (origin top left, 0..1) to PDF points
function pageMapper(page) {
  const { width, height } = page.getSize();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const seenW = rot % 180 ? height : width, seenH = rot % 180 ? width : height;
  const map = (fx, fy) => {
    const x = fx * seenW, y = fy * seenH;   // top-left origin, as seen
    if (rot === 90) return { x: y, y: x };
    if (rot === 180) return { x: width - x, y: y };
    if (rot === 270) return { x: width - y, y: height - x };
    return { x, y: height - y };
  };
  return { map, seenW, seenH, rot };
}

function pdfName(src, suffix) {
  return `${baseName(src.name)}-${suffix}.pdf`;
}

// ---------- Sign ----------

const SIGN_FONT = 'Caveat';
function loadSignFont() {
  if (!document.querySelector('#sign-font')) {
    document.head.append(h('link', { id: 'sign-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&display=swap' }));
  }
  return document.fonts.load(`600 48px ${SIGN_FONT}`);
}

tool({
  id: 'sign-pdf',
  cat: 'pdf',
  name: 'Sign a PDF',
  desc: 'Draw, type or upload your signature and place it on a page.',
  intro: 'Make your signature, then drag it where it belongs. Drag the orange corner to make it bigger or smaller.',
  keywords: 'sign signature pdf contract form initials autograph',
  mount(root) {
    const { work, side } = layout(root);
    let src = null, pageIndex = 0, sig = null;   // sig: { canvas, w, h } trimmed signature image
    let box = { x: 0.55, y: 0.78, w: 0.3 };      // position on the page as fractions (top-left origin)

    // Signature pad
    const pad = h('canvas', { class: 'sign-pad', width: 600, height: 200, 'aria-label': 'Draw your signature here' });
    const pctx = pad.getContext('2d');
    let drawing = false, last = null, inked = false;
    const ink = segmented([['#111110', 'Black'], ['#1D4ED8', 'Blue']], '#111110', () => updateSig(), 'Ink');
    const padPoint = (e) => {
      const r = pad.getBoundingClientRect();
      return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height];
    };
    pad.addEventListener('pointerdown', (e) => { drawing = true; last = padPoint(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = padPoint(e);
      pctx.strokeStyle = '#111110';
      pctx.lineWidth = 4;
      pctx.lineCap = pctx.lineJoin = 'round';
      pctx.beginPath();
      pctx.moveTo(...last);
      // Midpoint smoothing so fast strokes stay round
      const mid = [(last[0] + p[0]) / 2, (last[1] + p[1]) / 2];
      pctx.quadraticCurveTo(last[0], last[1], mid[0], mid[1]);
      pctx.lineTo(...p);
      pctx.stroke();
      last = p;
      inked = true;
    });
    const endStroke = () => { if (drawing) { drawing = false; updateSig(); } };
    pad.addEventListener('pointerup', endStroke);
    pad.addEventListener('pointercancel', endStroke);
    const clearPad = button('Clear', () => { pctx.clearRect(0, 0, pad.width, pad.height); inked = false; updateSig(); }, 'quiet small');

    const typed = textInput({ placeholder: 'Your name', spellcheck: false });
    typed.addEventListener('input', () => updateSig());
    let uploaded = null;
    const upload = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const uploadBtn = button('Choose an image of your signature', () => upload.click(), 'small');
    upload.addEventListener('change', async () => {
      const f = upload.files[0];
      if (!f) return;
      // Same cut-out as Korbi: the white paper around the signature becomes transparent
      uploaded = await cutOut(URL.createObjectURL(f));
      updateSig();
    });

    const drawField = h('div', { class: 'field' }, pad, h('div', { class: 'row' }, h('span', { class: 'note grow' }, 'Draw with your mouse, finger or pen.'), clearPad));
    const typeField = field('Type your name', typed);
    const imageField = h('div', { class: 'field' }, uploadBtn, upload, h('p', { class: 'note' }, 'A photo of your signature on white paper works. The paper gets removed.'));
    const mode = segmented([['draw', 'Draw'], ['type', 'Type'], ['image', 'Image']], 'draw', (v) => {
      drawField.hidden = v !== 'draw'; typeField.hidden = v !== 'type'; imageField.hidden = v !== 'image';
      if (v === 'type') loadSignFont().then(updateSig);
      updateSig();
    }, 'Signature');
    typeField.hidden = imageField.hidden = true;
    const addDate = checkbox(`Add today's date below`, false, () => updateSig());

    // Builds the signature image (trimmed, in the chosen ink) from whichever mode is active
    function updateSig() {
      let source = null;
      if (mode.value === 'draw' && inked) source = pad;
      if (mode.value === 'type' && typed.value.trim()) {
        const c = h('canvas', { width: 900, height: 220 });
        const g = c.getContext('2d');
        g.font = `600 150px ${SIGN_FONT}`;
        g.fillStyle = '#111110';
        g.textBaseline = 'middle';
        g.fillText(typed.value.trim(), 20, 115);
        source = c;
      }
      if (mode.value === 'image' && uploaded) source = uploaded;
      sig = source ? trimAndTint(source, ink.value, addDate.input.checked) : null;
      drawStage();
      update();
    }

    function trimAndTint(source, color, withDate) {
      const W = source.width, H = source.height;
      const px = source.getContext('2d').getImageData(0, 0, W, H).data;
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] < 20) continue;
        const p = (i - 3) / 4, x = p % W, y = (p / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < x0) return null;
      const pad_ = 6, w = x1 - x0 + 1 + pad_ * 2;
      const dateH = withDate ? Math.max(28, (y1 - y0) * 0.28) : 0;
      const c = h('canvas', { width: Math.max(w, withDate ? dateH * 6 : 0), height: y1 - y0 + 1 + pad_ * 2 + dateH });
      const g = c.getContext('2d');
      g.drawImage(source, x0 - pad_, y0 - pad_, w, y1 - y0 + 1 + pad_ * 2, 0, 0, w, y1 - y0 + 1 + pad_ * 2);
      // Ink colour for drawn and typed signatures; uploaded ones keep their own colour
      if (mode.value !== 'image') {
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'source-over';
      }
      if (withDate) {
        g.fillStyle = color;
        g.font = `${Math.round(dateH * 0.7)}px Helvetica, Arial, sans-serif`;
        g.textBaseline = 'bottom';
        g.fillText(new Date().toLocaleDateString(), pad_, c.height - 2);
      }
      return { canvas: c, ratio: c.height / c.width };
    }

    // Page stage: the page, with the signature on top
    const pageHolder = h('div', { class: 'sign-page' });
    const sigEl = h('div', { class: 'sign-box', hidden: true }, h('span', { class: 'handle', 'data-h': 'se' }));
    const stage = h('div', { class: 'sign-stage', hidden: true }, h('div', { class: 'sign-sheet' }, pageHolder, sigEl));
    const pageLabel = h('span', { class: 'note' });
    const prev = iconBtn('rotate', 'Previous page', () => goPage(pageIndex - 1));
    prev.innerHTML = '‹';
    const next = iconBtn('rotate', 'Next page', () => goPage(pageIndex + 1));
    next.innerHTML = '›';
    const pager = h('div', { class: 'row', hidden: true }, prev, pageLabel, next);

    async function goPage(i) {
      if (!src) return;
      pageIndex = clamp(i, 0, src.pageCount - 1);
      const width = Math.min(stage.clientWidth || 600, 720) - 32;
      pageHolder.replaceChildren(await renderPage(src, pageIndex, width));
      pageLabel.textContent = `Page ${pageIndex + 1} of ${src.pageCount}`;
      drawStage();
    }
    function drawStage() {
      sigEl.hidden = !sig || !src;
      if (!sig || !src) return;
      sigEl.style.backgroundImage = `url(${sig.canvas.toDataURL()})`;
      const sheet = pageHolder.firstChild;
      if (!sheet) return;
      const W = sheet.clientWidth, H = sheet.clientHeight;
      const w = box.w * W, hh = w * sig.ratio;
      box.x = clamp(box.x, 0, 1 - box.w);
      box.y = clamp(box.y, 0, 1 - hh / H);
      Object.assign(sigEl.style, { left: `${box.x * W}px`, top: `${box.y * H}px`, width: `${w}px`, height: `${hh}px` });
    }
    let drag = null;
    sigEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sigEl.setPointerCapture(e.pointerId);
      drag = { resize: !!e.target.dataset.h, x: e.clientX, y: e.clientY, start: { ...box } };
    });
    sigEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const sheet = pageHolder.firstChild;
      const W = sheet.clientWidth, H = sheet.clientHeight;
      const dx = (e.clientX - drag.x) / W, dy = (e.clientY - drag.y) / H;
      if (drag.resize) box.w = clamp(drag.start.w + dx, 0.06, 1 - box.x);
      else { box.x = drag.start.x + dx; box.y = drag.start.y + dy; }
      drawStage();
    });
    sigEl.addEventListener('pointerup', () => (drag = null));

    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop the PDF to sign',
      hint: 'or click to choose it',
      onFiles: async ([f]) => {
        try {
          src = await openPdf(f);
          stage.hidden = false;
          pager.hidden = src.pageCount < 2;
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          // Signatures usually go on the last page
          await goPage(src.pageCount - 1);
          update();
        } catch (err) { toast(err.message); }
      },
    });

    const go = button('Save signed PDF', () => busy(go, async () => {
      await need('pdflib');
      const doc = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const page = doc.getPage(pageIndex);
      const png = await doc.embedPng(await (await canvasToBlob(sig.canvas, 'image/png')).arrayBuffer());
      const m = pageMapper(page);
      const w = box.w * m.seenW, hh = w * sig.ratio;
      // Bottom-left corner of the box as seen, turned back into the page's own coordinates
      const p = m.map(box.x, box.y + hh / m.seenH);
      page.drawImage(png, { x: p.x, y: p.y, width: w, height: hh, rotate: PDFLib.degrees(m.rot) });
      downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), pdfName(src, 'signed'));
    }), 'primary');

    function update() { go.disabled = !src || !sig; }
    work.append(zone, pager, stage);
    side.append(field('Signature', mode), drawField, typeField, imageField, field('Ink', ink), addDate, actions(go));
    update();
  },
});

// ---------- Page numbers ----------

tool({
  id: 'page-numbers',
  cat: 'pdf',
  name: 'Add page numbers',
  desc: 'Number the pages of a PDF, wherever you want them.',
  intro: 'Pick where the numbers go and how they look. The first page can stay blank.',
  keywords: 'page numbers numbering paginate footer pdf',
  mount(root) {
    const { work, side } = layout(root);
    let src = null;
    const preview = h('div', { class: 'num-preview', hidden: true });
    const pos = segmented([['bl', 'Left'], ['bc', 'Centre'], ['br', 'Right'], ['tr', 'Top right']], 'bc', draw, 'Position');
    const fmt = segmented([['n', '1'], ['nt', '1 / 9'], ['page', 'Page 1 of 9']], 'n', draw, 'Format');
    const startAt = h('input', { class: 'input', type: 'number', min: 0, value: 1, oninput: draw });
    const size = rangeField('Size', { min: 7, max: 20, value: 10, unit: ' pt', onInput: draw });
    const skipFirst = checkbox('No number on the first page', false, draw);
    const label = (i, n) => {
      const num = i + Number(startAt.value || 1) - (skipFirst.input.checked ? 1 : 0);
      const total = n + Number(startAt.value || 1) - 1 - (skipFirst.input.checked ? 1 : 0);
      return fmt.value === 'n' ? `${num}` : fmt.value === 'nt' ? `${num} / ${total}` : `Page ${num} of ${total}`;
    };
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([f]) => {
        try {
          src = await openPdf(f);
          draw();
          preview.replaceChildren(await renderPage(src, 0, 300), h('span', { class: 'num-label' }));
          preview.hidden = false;
          zone.compact(true, `${f.name}, ${plural(src.pageCount, 'page')}. Drop another to replace it.`);
          draw();
        } catch (err) { toast(err.message); }
      },
    });
    function draw() {
      go.disabled = !src;
      if (!src) return;
      const el = preview.querySelector('.num-label');
      if (!el) return;   // preview still rendering
      el.textContent = label(skipFirst.input.checked ? 1 : 0, src.pageCount);
      el.dataset.pos = pos.value;
      el.style.fontSize = `${Number(size.input.value) * 300 / 595}px`;
    }
    const go = button('Save numbered PDF', () => busy(go, async () => {
      await need('pdflib');
      const doc = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pt = Number(size.input.value);
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        if (skipFirst.input.checked && i === 0) return;
        const text = label(i, pages.length);
        const m = pageMapper(page);
        const tw = font.widthOfTextAtSize(text, pt), margin = 28;
        const fx = pos.value === 'bl' ? margin / m.seenW : pos.value === 'bc' ? (m.seenW - tw) / 2 / m.seenW : (m.seenW - tw - margin) / m.seenW;
        const fy = pos.value === 'tr' ? (margin + pt) / m.seenH : (m.seenH - margin) / m.seenH;
        const p = m.map(fx, fy);
        page.drawText(text, { x: p.x, y: p.y, size: pt, font, color: PDFLib.rgb(0.2, 0.2, 0.2), rotate: PDFLib.degrees(m.rot) });
      });
      downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), pdfName(src, 'numbered'));
    }), 'primary');
    work.append(zone, preview);
    side.append(field('Where', pos), field('Format', fmt), field('Start counting at', startAt), size, skipFirst, actions(go));
    draw();
  },
});

// ---------- Watermark ----------

tool({
  id: 'watermark-pdf',
  cat: 'pdf',
  name: 'Add a watermark',
  desc: 'Stamp "DRAFT", "COPY" or your own text across every page.',
  intro: 'Type the text, pick how strong it should be, and it goes on every page.',
  keywords: 'watermark stamp draft confidential copy entwurf kopie pdf',
  mount(root) {
    const { work, side } = layout(root);
    let src = null;
    const preview = h('div', { class: 'num-preview', hidden: true });
    const text = textInput({ value: 'DRAFT' });
    text.addEventListener('input', draw);
    const presets = h('div', { class: 'row' }, ['DRAFT', 'COPY', 'CONFIDENTIAL', 'ENTWURF', 'KOPIE'].map((t) => button(t, () => { text.value = t; draw(); }, 'small quiet')));
    const COLORS = { grey: [0.5, 0.5, 0.5], red: [0.85, 0.2, 0.2], blue: [0.15, 0.35, 0.85] };
    const color = segmented([['grey', 'Grey'], ['red', 'Red'], ['blue', 'Blue']], 'grey', draw, 'Colour');
    const angle = segmented([['45', 'Diagonal'], ['0', 'Straight']], '45', draw, 'Angle');
    const opacity = rangeField('Strength', { min: 5, max: 60, value: 18, unit: '%', onInput: draw });
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([f]) => {
        try {
          src = await openPdf(f);
          draw();
          preview.replaceChildren(await renderPage(src, 0, 300), h('span', { class: 'wm-label' }));
          preview.hidden = false;
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          draw();
        } catch (err) { toast(err.message); }
      },
    });
    function draw() {
      go.disabled = !src || !text.value.trim();
      if (!src) return;
      const el = preview.querySelector('.wm-label');
      if (!el) return;   // preview still rendering
      el.textContent = text.value;
      const [r, g, b] = COLORS[color.value];
      Object.assign(el.style, { color: `rgb(${r * 255} ${g * 255} ${b * 255})`, opacity: opacity.input.value / 100, transform: `translate(-50%, -50%) rotate(${-angle.value}deg)` });
      el.style.fontSize = `${Math.min(70, 520 / Math.max(3, text.value.length))}px`;
    }
    const go = button('Save with watermark', () => busy(go, async () => {
      await need('pdflib');
      const doc = await PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true });
      const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const label = text.value.trim();
      const [r, g, b] = COLORS[color.value];
      for (const page of doc.getPages()) {
        const m = pageMapper(page);
        const a = Number(angle.value) * Math.PI / 180;
        // As big as fits along the chosen angle, centred on the page as seen
        const span = a ? Math.hypot(m.seenW, m.seenH) * 0.7 : m.seenW * 0.8;
        const size = Math.min(160, span / (font.widthOfTextAtSize(label, 1)));
        const tw = font.widthOfTextAtSize(label, size), th = size * 0.7;
        // Start point so the text's centre lands on the page centre after turning
        const cx = m.seenW / 2 - (Math.cos(a) * tw - Math.sin(a) * th) / 2;
        const cy = m.seenH / 2 + (Math.sin(a) * tw + Math.cos(a) * th) / 2;
        const p = m.map(cx / m.seenW, cy / m.seenH);
        page.drawText(label, { x: p.x, y: p.y, size, font, color: PDFLib.rgb(r, g, b), opacity: opacity.input.value / 100, rotate: PDFLib.degrees(Number(angle.value) + m.rot) });
      }
      downloadBlob(new Blob([await doc.save()], { type: 'application/pdf' }), pdfName(src, 'watermarked'));
    }), 'primary');
    work.append(zone, preview);
    side.append(field('Text', text), presets, field('Colour', color), field('Angle', angle), opacity, actions(go));
    draw();
  },
});

// ---------- Shrink ----------

tool({
  id: 'compress-pdf',
  cat: 'pdf',
  name: 'Make a PDF smaller',
  desc: 'Shrink big scans and photo PDFs for email or upload.',
  intro: 'Every page is saved again as a compressed picture. Great for scans. Text can\'t be selected or searched afterwards.',
  keywords: 'compress shrink reduce pdf size smaller email upload mb kb',
  mount(root) {
    const { work, side } = layout(root);
    let src = null, result = null;
    const info = h('div', { class: 'list' });
    const level = segmented([['small', 'Smallest'], ['medium', 'Balanced'], ['good', 'Better quality']], 'medium', () => { result = null; update(); }, 'Level');
    const grey = checkbox('Black and white (even smaller)', false, () => { result = null; update(); });
    const LEVELS = { small: [72, 0.45], medium: [110, 0.6], good: [150, 0.75] };
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'Scans and photo PDFs shrink the most',
      onFiles: async ([f]) => {
        try {
          src = await openPdf(f);
          result = null;
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          update();
        } catch (err) { toast(err.message); }
      },
    });
    const go = button('Shrink PDF', () => busy(go, async () => {
      await need('pdflib');
      const [dpi, q] = LEVELS[level.value];
      const out = await PDFLib.PDFDocument.create();
      for (let i = 0; i < src.pageCount; i++) {
        go.textContent = `Page ${i + 1} of ${src.pageCount}`;
        const page = await src.doc.getPage(i + 1);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: dpi / 72 });
        const c = h('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (grey.input.checked) {
          const d = ctx.getImageData(0, 0, c.width, c.height);
          for (let p = 0; p < d.data.length; p += 4) {
            const y = d.data[p] * 0.299 + d.data[p + 1] * 0.587 + d.data[p + 2] * 0.114;
            d.data[p] = d.data[p + 1] = d.data[p + 2] = y;
          }
          ctx.putImageData(d, 0, 0);
        }
        const jpg = await out.embedJpg(await (await canvasToBlob(c, 'image/jpeg', q)).arrayBuffer());
        const pdfPage = out.addPage([base.width, base.height]);
        pdfPage.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });
      }
      result = new Blob([await out.save()], { type: 'application/pdf' });
      update();
      if (result.size < src.file.size) downloadBlob(result, pdfName(src, 'small'));
      else toast('This PDF is already small. The shrunk version would be bigger, so nothing was saved.');
    }), 'primary');
    function update() {
      go.disabled = !src;
      go.textContent = 'Shrink PDF';
      info.replaceChildren(...(src ? [h('div', { class: 'list-item' }, h('div', { class: 'meta' },
        h('strong', {}, src.name),
        h('span', {}, `${plural(src.pageCount, 'page')}, ${formatBytes(src.file.size)}`),
        result ? h('span', { class: result.size < src.file.size ? 'better' : 'worse' }, `Shrunk: ${formatBytes(result.size)} (${Math.round((result.size / src.file.size - 1) * 100)}%)`) : null,
      ))] : []));
    }
    work.append(zone, info);
    side.append(field('How small', level), grey, h('p', { class: 'note' }, 'If the PDF is mostly text (not a scan), it is usually already as small as it gets.'), actions(go));
    update();
  },
});

// ---------- Text out of a PDF ----------

async function pdfText(src, onPage) {
  const pages = [];
  for (let i = 0; i < src.pageCount; i++) {
    const page = await src.doc.getPage(i + 1);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) text += item.str + (item.hasEOL ? '\n' : (item.str.endsWith(' ') ? '' : ' '));
    pages.push(text.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim());
    onPage?.(i);
  }
  return pages;
}

tool({
  id: 'pdf-to-text',
  cat: 'pdf',
  name: 'PDF to text',
  desc: 'Copy all the text out of a PDF.',
  intro: 'Gets the text out of a PDF so you can copy, search or edit it. For scans, use text recognition.',
  keywords: 'pdf to text txt extract copy words content',
  mount(root) {
    const { work, side } = layout(root);
    let src = null, pages = [];
    const out = textArea({ readonly: true, style: { minHeight: '420px' } });
    const info = h('p', { class: 'note' }, 'Add a PDF to start.');
    const breaks = checkbox('Mark where pages start', true, show);
    const zone = dropzone({
      accept: PDF_ACCEPT,
      multiple: false,
      title: 'Drop a PDF here',
      hint: 'or click to choose one',
      onFiles: async ([f]) => {
        try {
          src = await openPdf(f);
          pages = await pdfText(src);
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          show();
        } catch (err) { toast(err.message); }
      },
    });
    function show() {
      const text = pages.map((p, i) => (breaks.input.checked ? `--- Page ${i + 1} ---\n` : '') + p).join('\n\n');
      out.value = text;
      const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
      const empty = src && !pages.some((p) => p.trim());
      info.replaceChildren(!src ? 'Add a PDF to start.'
        : empty ? h('span', {}, 'No text found. This is probably a scanned PDF. ', h('a', { href: '#/ocr' }, 'Try text recognition'), '.')
        : `${plural(words, 'word')} on ${plural(src.pageCount, 'page')}.`);
      [save, copy].forEach((b) => (b.disabled = !src || empty));
    }
    const save = button('Download .txt', () => downloadBlob(new Blob([out.value], { type: 'text/plain' }), `${baseName(src.name)}.txt`), 'primary');
    const copy = button('Copy text', () => copyText(out.value, 'Text copied'));
    work.append(zone, out);
    side.append(info, breaks, actions(save, copy));
    show();
  },
});
