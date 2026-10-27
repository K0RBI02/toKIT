// ZIP files: look inside and take things out, or pack files into one.

const ZIP_ACCEPT = '.zip,application/zip,application/x-zip-compressed';

tool({
  id: 'zip-open',
  cat: 'text',
  name: 'Open a ZIP',
  desc: 'See what is in a ZIP file and take out what you need.',
  intro: 'Look inside without unpacking everything. Click a file to save just that one.',
  keywords: 'zip unzip open extract archive entpacken files folder',
  mount(root) {
    const { work, side } = layout(root);
    let zip = null, file = null, entries = [];
    const search = textInput({ placeholder: 'Filter by name', class: 'input' });
    const list = h('div', { class: 'list zip-list' });
    const info = h('p', { class: 'note' }, 'Add a ZIP file to start.');
    const zone = dropzone({
      accept: ZIP_ACCEPT,
      multiple: false,
      title: 'Drop a ZIP file here',
      hint: 'or click to choose one',
      onFiles: async ([f]) => {
        try {
          await need('jszip');
          zip = await JSZip.loadAsync(f);
          file = f;
          entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name));
          zone.compact(true, `${f.name}. Drop another to replace it.`);
          draw();
        } catch (err) {
          console.error(err);
          toast(/encrypt/i.test(err.message) ? 'This ZIP is password protected, which this tool can\'t open.' : `${f.name} is not a ZIP this tool can read`);
        }
      },
    });
    search.addEventListener('input', draw);
    const sizeOf = (e) => e._data?.uncompressedSize ?? 0;
    const save = async (e) => downloadBlob(await e.async('blob'), e.name.split('/').pop());
    const all = button('Download everything (zip)', () => busy(all, async () => {
      const files = await Promise.all(shown().map(async (e) => ({ name: e.name, blob: await e.async('blob') })));
      await downloadZip(files, shown().length === entries.length ? file.name : `${baseName(file.name)}-selection.zip`);
    }), 'primary');
    const shown = () => entries.filter((e) => e.name.toLowerCase().includes(search.value.trim().toLowerCase()));
    function draw() {
      const list_ = shown();
      all.disabled = !list_.length;
      all.textContent = zip && list_.length < entries.length ? `Download ${plural(list_.length, 'file')} (zip)` : 'Download everything (zip)';
      if (!zip) return;
      info.textContent = `${plural(entries.length, 'file')}, ${formatBytes(entries.reduce((s, e) => s + sizeOf(e), 0))} unpacked.`;
      list.replaceChildren(...list_.slice(0, 500).map((e) => {
        const parts = e.name.split('/');
        return h('div', { class: 'list-item' },
          h('div', { class: 'meta' },
            h('strong', {}, parts.pop()),
            h('span', {}, `${parts.length ? parts.join('/') + '/ · ' : ''}${formatBytes(sizeOf(e))}`),
          ),
          iconBtn('download', `Save ${e.name}`, () => save(e)),
        );
      }), list_.length > 500 ? h('p', { class: 'note' }, `and ${list_.length - 500} more. Use the filter to find them.`) : null);
    }
    work.append(zone, list);
    side.append(info, field('Filter', search), actions(all));
    draw();
  },
});

tool({
  id: 'zip-create',
  cat: 'text',
  name: 'Make a ZIP',
  desc: 'Pack several files into one ZIP to send them.',
  intro: 'Drop files, give the ZIP a name, done. Good for email and uploads that take only one file.',
  keywords: 'zip create pack compress archive bundle files send email packen',
  mount(root) {
    const { work, side } = layout(root);
    let files = [];
    const list = h('div', { class: 'list' });
    const nameInput = textInput({ value: 'files' });
    const level = segmented([['0', 'Fastest'], ['6', 'Normal'], ['9', 'Smallest']], '6', null, 'Compression');
    const zone = dropzone({
      accept: '',
      title: 'Drop files here',
      hint: 'Any kind, as many as you like',
      onFiles: (fs) => { files.push(...fs); draw(); },
    });
    const go = button('Download ZIP', () => busy(go, async () => {
      await need('jszip');
      const zip = new JSZip();
      const used = new Map();
      for (const f of files) {
        const n = used.get(f.name) || 0;
        used.set(f.name, n + 1);
        zip.file(n ? f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`) : f.name, f);
      }
      const lvl = Number(level.value);
      const blob = await zip.generateAsync({ type: 'blob', compression: lvl ? 'DEFLATE' : 'STORE', compressionOptions: { level: lvl || 1 } },
        (m) => (go.textContent = `Packing ${Math.round(m.percent)}%`));
      downloadBlob(blob, `${safeName(nameInput.value, 'files').replace(/\.zip$/i, '')}.zip`);
      draw();
    }), 'primary');
    function draw() {
      list.replaceChildren(...files.map((f) => h('div', { class: 'list-item' },
        h('div', { class: 'meta' }, h('strong', {}, f.name), h('span', {}, formatBytes(f.size))),
        iconBtn('remove', `Remove ${f.name}`, () => { files = files.filter((x) => x !== f); draw(); }, 'is-danger'),
      )));
      go.disabled = !files.length;
      go.textContent = files.length ? `Download ZIP (${plural(files.length, 'file')}, ${formatBytes(files.reduce((s, f) => s + f.size, 0))})` : 'Download ZIP';
      zone.compact(files.length > 0, 'Add more files');
    }
    work.append(list, zone);
    side.append(field('Name', nameInput), field('Compression', level, { hint: 'Photos, videos and PDFs barely shrink. Text and documents do.' }), actions(go));
    draw();
  },
});
