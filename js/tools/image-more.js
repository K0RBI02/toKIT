// More image tools: iPhone photos and reading text from pictures.
// The libraries download once (a few MB) and then run on this device.

const HEIC_ACCEPT = '.heic,.heif,image/heic,image/heif';
const isHeic = (f) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/.test(f.type);

// ---------- HEIC → JPG ----------

tool({
  id: 'heic-to-jpg',
  cat: 'image',
  name: 'iPhone photos to JPG',
  desc: 'Turn HEIC photos from an iPhone into normal JPGs.',
  intro: 'iPhones save photos as HEIC, which many apps and websites can\'t open. This makes JPGs out of them.',
  keywords: 'heic heif iphone ios apple photo to jpg jpeg convert',
  mount(root) {
    const { work, side } = layout(root);
    let items = [];
    const list = h('div', { class: 'list' });
    const quality = rangeField('Quality', { min: 50, max: 100, value: 90 });
    const zone = dropzone({
      accept: HEIC_ACCEPT,
      title: 'Drop iPhone photos here',
      hint: '.heic or .heif files, as many as you like',
      onFiles: (files) => {
        items.push(...files.map((file) => ({ file, out: null, url: null, error: null })));
        draw();
        convertAll();
      },
    });
    let running = Promise.resolve();
    function convertAll() {
      running = running.then(async () => {
        await need('heic');
        for (const it of items) {
          if (it.out || it.error) continue;
          try {
            const res = await heic2any({ blob: it.file, toType: 'image/jpeg', quality: quality.input.value / 100 });
            it.out = Array.isArray(res) ? res[0] : res;
            it.url = URL.createObjectURL(it.out);
          } catch {
            it.error = 'Could not read this photo';
          }
          draw();
        }
      }).catch((err) => toast(err.message));
      return running;
    }
    quality.input.addEventListener('change', () => {
      items.forEach((it) => { it.out = null; it.error = null; });
      draw();
      convertAll();
    });
    const name = (it) => `${baseName(it.file.name)}.jpg`;
    const go = button('Download', () => busy(go, async () => {
      await running;
      const done = items.filter((it) => it.out);
      if (done.length === 1) downloadBlob(done[0].out, name(done[0]));
      else await downloadZip(done.map((it) => ({ name: name(it), blob: it.out })), 'photos.zip');
    }), 'primary');
    function draw() {
      list.replaceChildren(...items.map((it) => h('div', { class: 'list-item' },
        it.url ? h('img', { class: 'thumb', alt: '', src: it.url }) : h('div', { class: 'thumb' }),
        h('div', { class: 'meta' },
          h('strong', {}, it.file.name),
          h('span', { class: it.error ? 'worse' : '' }, it.error || (it.out ? `${formatBytes(it.file.size)} to ${formatBytes(it.out.size)} JPG` : 'Converting…')),
        ),
        it.out ? iconBtn('download', `Download ${name(it)}`, () => downloadBlob(it.out, name(it))) : null,
      )));
      const n = items.filter((it) => it.out).length;
      go.disabled = !n;
      go.textContent = n > 1 ? `Download ${n} JPGs (zip)` : 'Download JPG';
      zone.compact(items.length > 0, 'Add more photos');
    }
    work.append(list, zone);
    side.append(quality, h('p', { class: 'note' }, 'The converter (about 1 MB) loads the first time you use it.'), actions(go));
    draw();
  },
});

// ---------- Text recognition ----------

const OCR_LANGS = [['eng', 'English'], ['deu', 'German'], ['eng+deu', 'Both']];

tool({
  id: 'ocr',
  cat: 'image',
  name: 'Read text from images',
  desc: 'Get the text out of photos, screenshots and scanned PDFs.',
  intro: 'Text recognition (OCR) right on your device. Sharp, straight pictures work best.',
  keywords: 'ocr text recognition read scan screenshot photo copy text from image picture scanned pdf',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, worker = null, workerLang = null;
    const out = textArea({ readonly: true, placeholder: 'The recognised text shows up here.', style: { minHeight: '320px' } });
    const preview = h('img', { class: 'ocr-preview', alt: '', hidden: true });
    const status = h('p', { class: 'note' }, 'Add a picture or a scanned PDF.');
    const lang = segmented(OCR_LANGS, 'eng+deu', () => file && run(), 'Language');
    const zone = dropzone({
      accept: `image/*,${PDF_ACCEPT}`,
      multiple: false,
      title: 'Drop a picture or scan here',
      hint: 'PNG, JPG, a screenshot, or a scanned PDF. Pasting works too.',
      onFiles: ([f]) => {
        file = f;
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.hidden = isPdf(f);
        if (!isPdf(f)) preview.src = URL.createObjectURL(f);
        zone.compact(true, `${f.name}. Drop another to replace it.`);
        run();
      },
    });

    async function getWorker(progress) {
      await need('tesseract');
      if (worker && workerLang === lang.value) return worker;
      if (worker) await worker.terminate();
      worker = await Tesseract.createWorker(lang.value.split('+'), 1, { logger: progress });
      workerLang = lang.value;
      return worker;
    }

    let runId = 0;
    async function run() {
      const id = ++runId;
      out.value = '';
      [save, copy].forEach((b) => (b.disabled = true));
      const say = (t) => { if (id === runId) status.textContent = t; };
      try {
        const w = await getWorker((m) => {
          if (m.status === 'recognizing text') say(`Reading… ${Math.round(m.progress * 100)}%`);
          else if (/load|initializ/.test(m.status)) say('Loading text recognition (about 10 MB, only the first time)…');
        });
        let pages = [];
        if (isPdf(file)) {
          const src = await openPdf(file);
          for (let i = 0; i < src.pageCount; i++) {
            say(`Reading page ${i + 1} of ${src.pageCount}…`);
            const canvas = await renderPage(src, i, 1600);
            pages.push((await w.recognize(canvas)).data.text.trim());
            if (id !== runId) return;
          }
        } else {
          pages = [(await w.recognize(file)).data.text.trim()];
        }
        if (id !== runId) return;
        out.value = pages.length > 1 ? pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n') : pages[0];
        const words = (out.value.match(/[\p{L}\p{N}]+/gu) || []).length;
        say(words ? `${plural(words, 'word')} found. Check names and numbers, OCR makes mistakes.` : 'No text found in this picture.');
        [save, copy].forEach((b) => (b.disabled = !words));
      } catch (err) {
        console.error(err);
        say('Text recognition could not start. Check your connection and try again.');
      }
    }
    const save = button('Download .txt', () => downloadBlob(new Blob([out.value], { type: 'text/plain' }), `${baseName(file.name)}.txt`), 'primary');
    const copy = button('Copy text', () => copyText(out.value, 'Text copied'));
    work.append(zone, preview, out);
    side.append(field('Language', lang), status, actions(save, copy));
    [save, copy].forEach((b) => (b.disabled = true));
    return () => { runId++; worker?.terminate(); };
  },
});
