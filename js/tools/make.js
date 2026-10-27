// QR codes and barcodes. QR-Maker moved in here: same idea, now in toKIT's look.

function svgToPng(svg, width) {
  return new Promise((resolve, reject) => {
    const vb = svg.viewBox.baseVal;
    const ratio = vb && vb.width ? vb.height / vb.width : svg.clientHeight / svg.clientWidth;
    const img = new Image();
    img.onload = () => {
      const c = h('canvas', { width, height: Math.round(width * ratio) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      canvasToBlob(c, 'image/png').then(resolve);
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  });
}
const svgBlob = (svg) => new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });

// ---------- QR ----------

const vcardEscape = (s) => s.replace(/([,;\\])/g, '\\$1');
const wifiEscape = (s) => s.replace(/([\\;,:"])/g, '\\$1');

tool({
  id: 'qr',
  cat: 'generate',
  name: 'QR codes',
  desc: 'Turn a link, Wi-Fi login or contact into a QR code.',
  intro: 'Type, see the code, save it as PNG or SVG. No tracking links, no expiry: the code holds your text directly.',
  keywords: 'qr code generator link url wifi wlan contact vcard barcode',
  mount(root) {
    const { work, side } = layout(root);
    const preview = h('div', { class: 'code-preview' });
    const info = h('p', { class: 'note' });
    const kind = segmented([['text', 'Link or text'], ['wifi', 'Wi-Fi'], ['contact', 'Contact']], 'text', () => { showFields(); draw(); }, 'Kind');

    const text = textArea({ placeholder: 'https://… or any text', style: { minHeight: '90px' }, oninput: () => draw() });
    const ssid = textInput({ placeholder: 'Network name', oninput: () => draw() });
    const pass = textInput({ placeholder: 'Password', oninput: () => draw() });
    const security = segmented([['WPA', 'WPA/WPA2'], ['WEP', 'WEP'], ['nopass', 'Open']], 'WPA', () => draw(), 'Security');
    const cName = textInput({ placeholder: 'Name', oninput: () => draw() });
    const cPhone = textInput({ placeholder: 'Phone', type: 'tel', oninput: () => draw() });
    const cMail = textInput({ placeholder: 'Email', type: 'email', oninput: () => draw() });
    const cOrg = textInput({ placeholder: 'Company (optional)', oninput: () => draw() });
    const textFields = h('div', { class: 'field' }, text);
    const wifiFields = h('div', { class: 'field' }, ssid, pass, security);
    const contactFields = h('div', { class: 'field' }, cName, cPhone, cMail, cOrg);
    function showFields() {
      textFields.hidden = kind.value !== 'text';
      wifiFields.hidden = kind.value !== 'wifi';
      contactFields.hidden = kind.value !== 'contact';
    }

    const style = segmented([['square', 'Squares'], ['round', 'Rounded'], ['dots', 'Dots']], 'square', () => draw(), 'Style');
    const fg = h('input', { type: 'color', value: '#111110', oninput: () => draw(), 'aria-label': 'Code colour' });
    const bg = h('input', { type: 'color', value: '#ffffff', oninput: () => draw(), 'aria-label': 'Background colour' });
    const ecc = segmented([['L', 'Low'], ['M', 'Medium'], ['H', 'High']], 'M', () => draw(), 'Error correction');

    function payload() {
      if (kind.value === 'wifi') {
        if (!ssid.value) return '';
        return `WIFI:T:${security.value};S:${wifiEscape(ssid.value)};${security.value === 'nopass' ? '' : `P:${wifiEscape(pass.value)};`};`;
      }
      if (kind.value === 'contact') {
        if (!cName.value && !cPhone.value && !cMail.value) return '';
        return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(cName.value)}`, cOrg.value && `ORG:${vcardEscape(cOrg.value)}`,
          cPhone.value && `TEL:${cPhone.value}`, cMail.value && `EMAIL:${cMail.value}`, 'END:VCARD'].filter(Boolean).join('\n');
      }
      return text.value;
    }

    let svg = null;
    function draw() {
      const data = payload();
      if (!window.qrcode || !data) {
        preview.replaceChildren(h('p', { class: 'note' }, data ? 'Loading…' : 'Your QR code shows up here.'));
        svg = null;
        update();
        return;
      }
      let qr;
      try {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        qr = qrcode(0, ecc.value);
        qr.addData(data, 'Byte');
        qr.make();
      } catch {
        preview.replaceChildren(h('div', { class: 'error-box' }, 'That is too much text for one QR code. Make it shorter or pick lower error correction.'));
        svg = null;
        update();
        return;
      }
      const n = qr.getModuleCount(), quiet = 4, size = n + quiet * 2;
      let shapes = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        const x = c + quiet, y = r + quiet;
        // The three corner squares stay square in every style, so phones still find them
        const finder = (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
        if (style.value === 'dots' && !finder) shapes += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.45"/>`;
        else if (style.value === 'round' && !finder) shapes += `<rect x="${x + 0.05}" y="${y + 0.05}" width="0.9" height="0.9" rx="0.3"/>`;
        else shapes += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
      }
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="${style.value === 'square' ? 'crispEdges' : 'auto'}"><rect width="${size}" height="${size}" fill="${bg.value}"/><g fill="${fg.value}">${shapes}</g></svg>`;
      preview.innerHTML = markup;
      svg = preview.querySelector('svg');
      info.textContent = `${data.length} characters, ${n}×${n} modules.`;
      update();
    }

    const fileName = () => (kind.value === 'wifi' ? `wifi-${ssid.value}` : kind.value === 'contact' ? cName.value || 'contact' : 'qr-code').replace(/[^\w-]+/g, '-').slice(0, 40) || 'qr-code';
    const png = button('Download PNG', () => busy(png, async () => downloadBlob(await svgToPng(svg, 1024), `${fileName()}.png`)), 'primary');
    const vec = button('Download SVG', () => downloadBlob(svgBlob(svg), `${fileName()}.svg`));
    const copy = button('Copy image', () => busy(copy, async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await svgToPng(svg, 1024) })]);
        toast('QR code copied');
      } catch { toast('Copying images is blocked here. Download it instead.'); }
    }), 'quiet small');
    function update() { [png, vec, copy].forEach((b) => (b.disabled = !svg)); }

    work.append(h('div', { class: 'panel' }, field('What should the code hold?', kind), textFields, wifiFields, contactFields), preview, info);
    side.append(field('Style', style), field('Colours', h('div', { class: 'row' }, fg, h('span', { class: 'note' }, 'code'), bg, h('span', { class: 'note' }, 'background'))),
      field('Error correction', ecc, { hint: 'High still scans when part of the code is covered.' }), actions(png, vec, copy));
    showFields();
    need('qrcode').then(draw).catch((err) => toast(err.message));
    draw();
  },
});

// ---------- Barcode ----------

const BARCODES = [
  ['CODE128', 'Code 128', 'Any text: letters, numbers, signs'],
  ['EAN13', 'EAN-13', '12 or 13 digits, the usual product barcode'],
  ['EAN8', 'EAN-8', '7 or 8 digits, for small packs'],
  ['UPC', 'UPC-A', '11 or 12 digits, US products'],
  ['CODE39', 'Code 39', 'Capital letters, numbers, - . $ / + % and space'],
  ['ITF14', 'ITF-14', '13 or 14 digits, for shipping boxes'],
];

tool({
  id: 'barcode',
  cat: 'generate',
  name: 'Barcode generator',
  desc: 'EAN, UPC, Code 128 and more, as PNG or SVG.',
  intro: 'Type the number or text, pick the barcode type. Check digits are added for you.',
  keywords: 'barcode ean ean13 upc code128 code39 itf strichcode generator product label',
  mount(root) {
    const { work, side } = layout(root);
    const value = textInput({ value: '4006381333931', class: 'input is-code', oninput: () => draw() });
    const format = select(BARCODES.map(([v, l]) => [v, l]), 'EAN13', () => { hint.textContent = BARCODES.find((b) => b[0] === format.value)[2]; draw(); });
    const hint = h('p', { class: 'field-hint' }, BARCODES[1][2]);
    const showText = checkbox('Show the number under the bars', true, () => draw());
    const height = rangeField('Height', { min: 30, max: 160, value: 90, unit: ' px', onInput: () => draw() });
    const preview = h('div', { class: 'code-preview is-wide' });
    const error = h('div', { class: 'error-box', hidden: true });
    let ok = false;
    function draw() {
      if (!window.JsBarcode) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ok = true;
      try {
        JsBarcode(svg, value.value.trim() || ' ', {
          format: format.value, height: Number(height.input.value), displayValue: showText.input.checked,
          font: 'JetBrains Mono, monospace', fontSize: 18, margin: 16, background: '#ffffff', lineColor: '#111110',
          valid: (v) => { ok = v; },
        });
      } catch { ok = false; }
      error.hidden = ok;
      error.textContent = `That doesn't fit ${BARCODES.find((b) => b[0] === format.value)[1]}. ${BARCODES.find((b) => b[0] === format.value)[2]}.`;
      if (ok) preview.replaceChildren(svg);
      [png, vec].forEach((b) => (b.disabled = !ok));
    }
    const name = () => `barcode-${value.value.trim().replace(/[^\w-]+/g, '-').slice(0, 30)}`;
    const png = button('Download PNG', () => busy(png, async () => downloadBlob(await svgToPng(preview.querySelector('svg'), 1200), `${name()}.png`)), 'primary');
    const vec = button('Download SVG', () => downloadBlob(svgBlob(preview.querySelector('svg')), `${name()}.svg`));
    work.append(h('div', { class: 'panel' }, field('Number or text', value)), error, preview);
    side.append(field('Type', format), hint, height, showText, actions(png, vec));
    need('barcode').then(draw).catch((err) => toast(err.message));
  },
});
