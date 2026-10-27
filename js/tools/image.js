// Image tools. All the work happens on a <canvas> in this tab.

const IMAGE_ACCEPT = 'image/*';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FORMAT_NAME = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' };
const outputTypeFor = (file, format) => format !== 'keep' ? format : (EXT[file.type] ? file.type : 'image/png');

// Big downscales in one step look jagged, so halve the size until close, then do the last step
function drawScaled(source, w, h) {
  let cur = source;
  let cw = source.naturalWidth || source.width, ch = source.naturalHeight || source.height;
  while (cw / 2 > w && ch / 2 > h) {
    cw = Math.round(cw / 2); ch = Math.round(ch / 2);
    const step = h_canvas(cw, ch);
    step.getContext('2d').drawImage(cur, 0, 0, cw, ch);
    cur = step;
  }
  const out = h_canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}
const h_canvas = (width, height) => h('canvas', { width, height });

async function encode(canvas, type, quality) {
  if (type === 'image/jpeg') {
    // JPG has no transparency: put white behind see-through parts
    const flat = h_canvas(canvas.width, canvas.height);
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    canvas = flat;
  }
  return canvasToBlob(canvas, type, quality);
}

// ---------- Batch engine shared by convert, resize and compress ----------

function batchImageTool(root, { controls, settings, emptyHint }) {
  const { work, side } = layout(root);
  let items = [];
  let version = 0;
  let key = 1;

  const list = h('div', { class: 'list' });
  const zone = dropzone({
    accept: IMAGE_ACCEPT,
    title: 'Drop images here',
    hint: emptyHint || 'As many as you like. Click to choose or paste.',
    onFiles: async (files) => {
      for (const file of files) {
        try { items.push({ key: key++, file, img: await loadImage(file), result: null }); }
        catch (err) { toast(err.message); }
      }
      draw();
      processAll();
    },
  });
  const summary = h('p', { class: 'note' });
  const go = button('Download', () => busy(go, async () => {
    await processing;
    const results = await Promise.all(items.map(resultOf));
    if (results.length === 1) downloadBlob(results[0].blob, results[0].name);
    else await downloadZip(results, 'images.zip');
  }), 'primary');
  const clearAll = button('Remove all', () => { items.forEach((i) => URL.revokeObjectURL(i.img.src)); items = []; draw(); }, 'quiet small');

  async function process(item) {
    const s = settings();
    const w0 = item.img.naturalWidth, h0 = item.img.naturalHeight;
    const [w, h] = s.size(w0, h0).map((v) => Math.max(1, Math.round(v)));
    const type = outputTypeFor(item.file, s.format);
    const blob = await encode(drawScaled(item.img, w, h), type, s.quality);
    return { blob, name: `${baseName(item.file.name)}.${EXT[blob.type] || 'png'}`, w, h, version };
  }
  const fresh = (item) => item.result?.version === version;
  async function resultOf(item) {
    if (!fresh(item)) { item.result = await process(item); info(item); }
    return item.result;
  }

  let processing = Promise.resolve();
  function processAll() {
    processing = processing.then(async () => {
      for (const item of [...items]) {
        if (!fresh(item) && items.includes(item)) await resultOf(item);
      }
      updateSummary();
    });
  }

  function info(item) {
    const el = list.querySelector(`[data-key="${item.key}"] .meta span`);
    if (!el) return;
    const before = `${item.img.naturalWidth}×${item.img.naturalHeight}, ${formatBytes(item.file.size)}`;
    if (!fresh(item)) { el.textContent = before; return; }
    const r = item.result;
    const diff = Math.round((r.blob.size / item.file.size - 1) * 100);
    el.replaceChildren(
      `${before} to ${r.w}×${r.h} ${FORMAT_NAME[r.blob.type] || ''}, ${formatBytes(r.blob.size)} `,
      h('span', { class: diff <= 0 ? 'better' : 'worse', style: { display: 'inline' } }, `${diff > 0 ? '+' : ''}${diff}%`),
    );
  }

  function updateSummary() {
    const before = items.reduce((s, i) => s + i.file.size, 0);
    const done = items.every(fresh);
    const after = done ? items.reduce((s, i) => s + i.result.blob.size, 0) : null;
    summary.textContent = !items.length ? 'Add images to start.'
      : `${plural(items.length, 'image')}, ${formatBytes(before)}` + (after != null ? ` before, ${formatBytes(after)} after.` : '.');
  }

  function draw() {
    list.replaceChildren(...items.map((item) => h('div', { class: 'list-item', 'data-key': item.key },
      h('img', { class: 'thumb', alt: '', src: item.img.src }),
      h('div', { class: 'meta' }, h('strong', {}, item.file.name), h('span', {})),
      iconBtn('download', `Download ${item.file.name}`, async () => { const r = await resultOf(item); downloadBlob(r.blob, r.name); }),
      iconBtn('remove', `Remove ${item.file.name}`, () => { URL.revokeObjectURL(item.img.src); items = items.filter((i) => i !== item); draw(); }, 'is-danger'),
    )));
    items.forEach((i) => info(i));
    zone.compact(items.length > 0, 'Add more images');
    go.disabled = !items.length;
    go.textContent = items.length > 1 ? `Download ${items.length} images (zip)` : 'Download image';
    clearAll.hidden = items.length < 2;
    updateSummary();
  }

  const changed = debounce(() => { version++; items.forEach((i) => info(i)); updateSummary(); processAll(); }, 200);

  work.append(list, zone);
  side.append(...controls(changed), summary, actions(go, clearAll));
  draw();
}

const qualityControl = (onChange, value = 82) => rangeField('Quality', { min: 10, max: 100, value, onInput: onChange });

tool({
  id: 'convert-image',
  cat: 'image',
  name: 'Convert images',
  desc: 'Change images to JPG, PNG or WebP.',
  intro: 'Turn images into JPG, PNG or WebP. Works with many files at once.',
  keywords: 'convert format jpg jpeg png webp heic gif bmp avif change type',
  mount(root) {
    let format, quality;
    batchImageTool(root, {
      controls: (changed) => {
        quality = qualityControl(changed, 90);
        format = segmented([['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']], 'image/jpeg', (v) => {
          quality.hidden = v === 'image/png';
          changed();
        }, 'Format');
        return [field('Convert to', format), quality];
      },
      settings: () => ({ format: format.value, quality: quality.input.value / 100, size: (w, h) => [w, h] }),
    });
  },
});

tool({
  id: 'resize-image',
  cat: 'image',
  name: 'Resize images',
  desc: 'Make images smaller or larger, many at once.',
  intro: 'Set a maximum size, a percentage or exact pixels. Proportions stay intact unless you choose exact pixels.',
  keywords: 'resize scale shrink smaller bigger dimensions pixels width height',
  mount(root) {
    let mode, maxW, maxH, pct, exW, exH;
    batchImageTool(root, {
      controls: (changed) => {
        const num = (value, label) => h('input', { class: 'input', type: 'number', min: 1, value, 'aria-label': label, oninput: changed });
        maxW = num(1920, 'Max width'); maxH = num(1920, 'Max height');
        pct = num(50, 'Percent');
        exW = num(1080, 'Width'); exH = num(1080, 'Height');
        const maxField = field('Fit inside', h('div', { class: 'row' }, h('div', { class: 'grow' }, maxW), '×', h('div', { class: 'grow' }, maxH)), { hint: 'Pixels. Smaller images stay as they are.' });
        const pctField = field('Percent', pct);
        const exField = field('Exact size', h('div', { class: 'row' }, h('div', { class: 'grow' }, exW), '×', h('div', { class: 'grow' }, exH)), { hint: 'Images get stretched if the proportions differ.' });
        mode = segmented([['max', 'Fit inside'], ['pct', 'Percent'], ['exact', 'Exact']], 'max', (v) => {
          maxField.hidden = v !== 'max'; pctField.hidden = v !== 'pct'; exField.hidden = v !== 'exact';
          changed();
        }, 'Resize by');
        pctField.hidden = exField.hidden = true;
        return [field('Resize by', mode), maxField, pctField, exField];
      },
      settings: () => ({
        format: 'keep',
        quality: 0.9,
        size: (w, h) => {
          if (mode.value === 'pct') { const f = (Number(pct.value) || 100) / 100; return [w * f, h * f]; }
          if (mode.value === 'exact') return [Number(exW.value) || w, Number(exH.value) || h];
          const f = Math.min((Number(maxW.value) || Infinity) / w, (Number(maxH.value) || Infinity) / h, 1);
          return [w * f, h * f];
        },
      }),
    });
  },
});

tool({
  id: 'compress-image',
  cat: 'image',
  name: 'Compress images',
  desc: 'Make image files smaller with little visible change.',
  intro: 'Shrinks the file size. You see the result for every image before you download.',
  keywords: 'compress optimize reduce file size smaller kb mb email upload',
  mount(root) {
    let quality, format, shrink;
    batchImageTool(root, {
      controls: (changed) => {
        quality = qualityControl(changed, 72);
        format = segmented([['keep', 'Keep'], ['image/webp', 'WebP'], ['image/jpeg', 'JPG']], 'keep', changed, 'Format');
        shrink = checkbox('Also limit to 2000 px', true, changed);
        return [quality, field('Format', format, { hint: 'WebP is usually the smallest. PNGs only get smaller as WebP or JPG.' }), shrink];
      },
      settings: () => ({
        format: format.value,
        quality: quality.input.value / 100,
        size: (w, h) => {
          if (!shrink.input.checked) return [w, h];
          const f = Math.min(2000 / w, 2000 / h, 1);
          return [w * f, h * f];
        },
      }),
    });
  },
});

// ---------- Crop & rotate ----------

tool({
  id: 'crop-image',
  cat: 'image',
  name: 'Crop & rotate',
  desc: 'Cut out part of an image, turn or flip it.',
  intro: 'Drag the frame or its corners. Pick a shape like square or 16:9 if you need one.',
  keywords: 'crop cut trim rotate turn flip mirror square aspect ratio',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, img = null, base = null;   // base: the image after rotate and flip
    let rotation = 0, flipped = false, rect = null, ratio = 0;

    const stageImg = h('img', { alt: 'Image to crop' });
    const box = h('div', { class: 'crop-box' }, ['nw', 'ne', 'sw', 'se'].map((c) => h('span', { class: 'handle', 'data-h': c })));
    const stage = h('div', { class: 'crop-stage', hidden: true }, h('div', { class: 'crop-wrap' }, stageImg, box));
    const zone = dropzone({
      accept: IMAGE_ACCEPT,
      multiple: false,
      title: 'Drop an image here',
      hint: 'or click to choose one',
      onFiles: async ([f]) => {
        try {
          if (img) URL.revokeObjectURL(img.src);
          file = f; img = await loadImage(f);
          rotation = 0; flipped = false;
          rebuild(true);
        } catch (err) { toast(err.message); }
      },
    });

    function rebuild(resetRect) {
      const sideways = rotation % 180 !== 0;
      const w = img.naturalWidth, hh = img.naturalHeight;
      base = h_canvas(sideways ? hh : w, sideways ? w : hh);
      const ctx = base.getContext('2d');
      ctx.translate(base.width / 2, base.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      if (flipped) ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, -hh / 2);
      stageImg.onload = () => {
        if (resetRect || !rect) rect = { x: 0, y: 0, w: stageImg.clientWidth, h: stageImg.clientHeight };
        if (ratio) fitRatio();
        drawBox();
      };
      stageImg.src = base.toDataURL();
      stage.hidden = false;
      zone.compact(true, `${file.name}. Drop another image to replace it.`);
      update();
    }

    const sizeOut = h('p', { class: 'note' });
    const scale = () => base.width / stageImg.clientWidth;
    function drawBox() {
      Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      sizeOut.textContent = `Result: ${Math.round(rect.w * scale())} × ${Math.round(rect.h * scale())} px`;
    }
    function fitRatio() {
      const W = stageImg.clientWidth, H = stageImg.clientHeight;
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      let w = Math.max(rect.w, rect.h * ratio), hh = w / ratio;
      if (w > W) { w = W; hh = w / ratio; }
      if (hh > H) { hh = H; w = hh * ratio; }
      rect = { w, h: hh, x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - hh / 2, 0, H - hh) };
    }

    let drag = null;
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      drag = { handle: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, start: { ...rect } };
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const W = stageImg.clientWidth, H = stageImg.clientHeight, s = drag.start;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.handle === 'move') {
        rect = { ...s, x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h) };
        return drawBox();
      }
      // The corner across from the dragged one stays where it is
      const west = drag.handle.includes('w'), north = drag.handle.includes('n');
      const fx = west ? s.x + s.w : s.x, fy = north ? s.y + s.h : s.y;
      const x = clamp((west ? s.x : s.x + s.w) + dx, 0, W);
      const y = clamp((north ? s.y : s.y + s.h) + dy, 0, H);
      let w = Math.max(16, Math.abs(x - fx)), hh = Math.max(16, Math.abs(y - fy));
      if (ratio) {
        if (w / hh > ratio) hh = w / ratio; else w = hh * ratio;
        const maxW = west ? fx : W - fx, maxH = north ? fy : H - fy;
        if (w > maxW) { w = maxW; hh = w / ratio; }
        if (hh > maxH) { hh = maxH; w = hh * ratio; }
      }
      rect = { w, h: hh, x: west ? fx - w : fx, y: north ? fy - hh : fy };
      drawBox();
    });
    const stop = () => (drag = null);
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);

    // Keep the frame in place when the window size changes
    let lastWidth = 0;
    const ro = new ResizeObserver(() => {
      if (!rect || !stageImg.clientWidth) return;
      if (lastWidth) {
        const f = stageImg.clientWidth / lastWidth;
        rect = { x: rect.x * f, y: rect.y * f, w: rect.w * f, h: rect.h * f };
        drawBox();
      }
      lastWidth = stageImg.clientWidth;
    });
    ro.observe(stageImg);

    const ratioCtl = segmented([['0', 'Free'], ['1', 'Square'], ['1.3333', '4:3'], ['1.5', '3:2'], ['1.7778', '16:9'], ['0.5625', '9:16']], '0', (v) => {
      ratio = Number(v);
      if (!rect) return;
      if (ratio) fitRatio();
      drawBox();
    }, 'Shape');
    const turnLeft = button('Turn left', () => { rotation = (rotation + 270) % 360; rebuild(true); }, 'small');
    const turnRight = button('Turn right', () => { rotation = (rotation + 90) % 360; rebuild(true); }, 'small');
    const flip = button('Mirror', () => { flipped = !flipped; rebuild(false); }, 'small');
    const format = segmented([['keep', 'Keep'], ['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']], 'keep', null, 'Format');
    const go = button('Save image', () => busy(go, async () => {
      const s = scale();
      const sx = Math.round(rect.x * s), sy = Math.round(rect.y * s);
      const sw = Math.max(1, Math.round(rect.w * s)), sh = Math.max(1, Math.round(rect.h * s));
      const out = h_canvas(sw, sh);
      out.getContext('2d').drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await encode(out, outputTypeFor(file, format.value), 0.92);
      downloadBlob(blob, `${baseName(file.name)}-cropped.${EXT[blob.type]}`);
    }), 'primary');

    function update() {
      [turnLeft, turnRight, flip, go].forEach((b) => (b.disabled = !img));
    }

    work.append(zone, stage);
    side.append(field('Shape', ratioCtl), h('div', { class: 'row' }, turnLeft, turnRight, flip), field('Format', format), sizeOut, actions(go));
    update();
    return () => ro.disconnect();
  },
});

// ---------- Remove metadata ----------

// Reads the few EXIF fields people care about: camera, date and GPS position
function readExif(buf) {
  const v = new DataView(buf);
  if (v.getUint16(0) !== 0xFFD8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off), len = v.getUint16(off + 2);
    if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if (marker === 0xFFDA) break;
    off += 2 + len;
  }
  return null;
}
function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le), u32 = (o) => v.getUint32(start + o, le);
  const out = {};
  const readIfd = (ifd) => {
    const tags = {};
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return tags;
  };
  const str = (t) => {
    if (!t) return null;
    const o = t.count > 4 ? u32(t.at) : t.at;
    let s = '';
    for (let i = 0; i < t.count - 1; i++) s += String.fromCharCode(v.getUint8(start + o + i));
    return s.trim();
  };
  const rationals = (t) => {
    const o = u32(t.at);
    return Array.from({ length: t.count }, (_, i) => u32(o + i * 8) / u32(o + i * 8 + 4));
  };
  try {
    const ifd0 = readIfd(u32(4));
    out.camera = [str(ifd0[0x010F]), str(ifd0[0x0110])].filter(Boolean).join(' ') || null;
    out.date = str(ifd0[0x0132]);
    out.orientation = ifd0[0x0112] ? u16(ifd0[0x0112].at) : 1;
    if (ifd0[0x8825]) {
      const gps = readIfd(u32(ifd0[0x8825].at));
      if (gps[2] && gps[4]) {
        const deg = ([d, m, s]) => d + m / 60 + s / 3600;
        const lat = deg(rationals(gps[2])) * (str(gps[1]) === 'S' ? -1 : 1);
        const lon = deg(rationals(gps[4])) * (str(gps[3]) === 'W' ? -1 : 1);
        if (isFinite(lat) && isFinite(lon) && (lat || lon)) out.gps = [lat, lon];
      }
    }
  } catch { /* broken EXIF: report what we have */ }
  return out;
}

// Lossless: drops the metadata blocks and keeps the picture data untouched
function stripJpeg(buf) {
  const v = new DataView(buf);
  const parts = [buf.slice(0, 2)];
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if (marker === 0xFFDA) { parts.push(buf.slice(off)); break; }
    const len = v.getUint16(off + 2);
    // APP1 = EXIF/XMP, APP13 = IPTC/Photoshop, COM = comments. ICC colour (APP2) stays.
    const drop = marker === 0xFFE1 || marker === 0xFFED || marker === 0xFFFE;
    if (!drop) parts.push(buf.slice(off, off + 2 + len));
    off += 2 + len;
  }
  return new Blob(parts, { type: 'image/jpeg' });
}
function stripPng(buf) {
  const v = new DataView(buf);
  const parts = [buf.slice(0, 8)];
  let off = 8;
  while (off + 8 <= v.byteLength) {
    const len = v.getUint32(off);
    const type = String.fromCharCode(...new Uint8Array(buf, off + 4, 4));
    if (!['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(type)) parts.push(buf.slice(off, off + 12 + len));
    off += 12 + len;
  }
  return new Blob(parts, { type: 'image/png' });
}

tool({
  id: 'remove-metadata',
  cat: 'image',
  name: 'Remove photo metadata',
  desc: 'Strip location, camera and date before you share a photo.',
  intro: 'Photos often carry where and when they were taken. See what is in yours and save clean copies. The picture itself stays untouched.',
  keywords: 'exif gps location privacy metadata strip remove clean camera',
  mount(root) {
    const { work, side } = layout(root);
    let items = [];
    const list = h('div', { class: 'list' });
    const zone = dropzone({
      accept: 'image/jpeg,image/png,image/webp',
      title: 'Drop photos here',
      hint: 'JPG, PNG or WebP. Click to choose or paste.',
      onFiles: async (files) => {
        for (const file of files) {
          const buf = await file.arrayBuffer();
          const exif = file.type === 'image/jpeg' ? readExif(buf) : null;
          let clean;
          if (file.type === 'image/jpeg' && (exif?.orientation || 1) === 1) clean = stripJpeg(buf);
          else if (file.type === 'image/png') clean = stripPng(buf);
          else {
            // Rotated JPGs and WebP get redrawn, so the photo keeps the right way up
            const img = await loadImage(file);
            const c = h_canvas(img.naturalWidth, img.naturalHeight);
            c.getContext('2d').drawImage(img, 0, 0);
            clean = await canvasToBlob(c, file.type, 0.95);
            URL.revokeObjectURL(img.src);
          }
          items.push({ file, exif, clean, url: URL.createObjectURL(file) });
        }
        draw();
      },
    });
    const go = button('Download clean copies', () => {
      if (items.length === 1) downloadBlob(items[0].clean, items[0].file.name);
      else busy(go, () => downloadZip(items.map((i) => ({ name: i.file.name, blob: i.clean })), 'clean-photos.zip'));
    }, 'primary');

    function draw() {
      list.replaceChildren(...items.map((it) => {
        const found = [];
        if (it.exif?.gps) found.push(h('span', { class: 'worse', style: { display: 'inline' } }, `Location ${it.exif.gps.map((n) => n.toFixed(5)).join(', ')}`));
        if (it.exif?.camera) found.push(`Camera ${it.exif.camera}`);
        if (it.exif?.date) found.push(`Taken ${it.exif.date}`);
        const removed = it.file.size - it.clean.size;
        return h('div', { class: 'list-item' },
          h('img', { class: 'thumb', alt: '', src: it.url }),
          h('div', { class: 'meta' },
            h('strong', {}, it.file.name),
            h('span', {}, found.length ? found.flatMap((f, i) => (i ? [', ', f] : [f])) : 'No camera, date or location found'),
            h('span', {}, removed > 0 ? `${formatBytes(removed)} of metadata removed` : 'Saved as a clean copy'),
          ),
          iconBtn('download', `Download clean ${it.file.name}`, () => downloadBlob(it.clean, it.file.name)),
        );
      }));
      zone.compact(items.length > 0, 'Add more photos');
      go.disabled = !items.length;
      go.textContent = items.length > 1 ? `Download ${items.length} clean copies` : 'Download clean copy';
    }

    work.append(list, zone);
    side.append(h('p', { class: 'note' }, 'Removes GPS location, camera details, dates, comments and editing history. Colour profiles are kept so colours look the same.'), actions(go));
    draw();
  },
});
