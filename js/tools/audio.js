// Audio tools. The browser decodes the sound (Web Audio), we write WAV ourselves and MP3 with lamejs.
// Video files work too: decoding them gives you their sound track.

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba';
const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.webm,.mkv,.m4v';

let audioCtx;
async function decodeAudio(file) {
  audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await audioCtx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} has no sound this browser can read`);
  }
}

const formatTime = (s) => {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};

// A copy of part of a buffer, with optional fades and volume change
function sliceAudio(buffer, start, end, { fadeIn = 0, fadeOut = 0, gain = 1 } = {}) {
  const rate = buffer.sampleRate;
  const from = Math.floor(start * rate), to = Math.floor(end * rate), len = Math.max(1, to - from);
  const out = new AudioBuffer({ length: len, numberOfChannels: buffer.numberOfChannels, sampleRate: rate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c).subarray(from, to);
    const dst = out.getChannelData(c);
    const fi = Math.floor(fadeIn * rate), fo = Math.floor(fadeOut * rate);
    for (let i = 0; i < len; i++) {
      let g = gain;
      if (i < fi) g *= i / fi;
      if (i > len - fo) g *= (len - i) / fo;
      dst[i] = clamp((src[i] || 0) * g, -1, 1);
    }
  }
  return out;
}

function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, rate = buffer.sampleRate, len = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = clamp(chans[c][i], -1, 1);
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
    o += 2;
  }
  return new Blob([data], { type: 'audio/wav' });
}

// MP3 encoding is slow-ish, so it yields to the page every few chunks and reports progress
async function encodeMp3(buffer, kbps, onProgress) {
  await need('lame');
  const ch = Math.min(2, buffer.numberOfChannels);
  // lamejs supports these rates; anything else gets resampled first
  const RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
  if (!RATES.includes(buffer.sampleRate)) {
    const off = new OfflineAudioContext(ch, Math.ceil(buffer.duration * 44100), 44100);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    buffer = await off.startRendering();
  }
  const enc = new lamejs.Mp3Encoder(ch, buffer.sampleRate, kbps);
  const toInt16 = (f) => { const out = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = clamp(f[i], -1, 1); out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF; } return out; };
  const left = toInt16(buffer.getChannelData(0));
  const right = ch > 1 ? toInt16(buffer.getChannelData(1)) : null;
  const parts = [];
  const STEP = 1152;
  for (let i = 0; i < left.length; i += STEP) {
    const l = left.subarray(i, i + STEP);
    const chunk = right ? enc.encodeBuffer(l, right.subarray(i, i + STEP)) : enc.encodeBuffer(l);
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if (i % (STEP * 400) === 0) {
      onProgress?.(i / left.length);
      await new Promise((r) => setTimeout(r));
    }
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}

async function encodeAudio(buffer, format, onProgress) {
  return format === 'wav' ? encodeWav(buffer) : encodeMp3(buffer, Number(format), onProgress);
}
const FORMAT_OPTIONS = [['192', 'MP3'], ['wav', 'WAV']];

// ---------- Trim ----------

tool({
  id: 'audio-trim',
  cat: 'audio',
  name: 'Trim audio',
  desc: 'Cut the start and end off a song, voice note or recording.',
  intro: 'Drag the orange handles to choose the part you want. Listen to it, then save it as MP3 or WAV.',
  keywords: 'trim cut audio mp3 wav song ringtone voice memo shorten clip fade',
  mount(root) {
    const { work, side } = layout(root);
    let file = null, buffer = null, start = 0, end = 0, playing = null;
    const canvas = h('canvas', { class: 'wave', 'aria-label': 'Waveform. Drag to choose the part to keep.' });
    const times = h('div', { class: 'time-row' });
    const wave = h('div', { class: 'wave-wrap', hidden: true }, canvas, times);
    const zone = dropzone({
      accept: `${AUDIO_ACCEPT},${VIDEO_ACCEPT}`,
      multiple: false,
      title: 'Drop an audio file here',
      hint: 'MP3, WAV, M4A, OGG, FLAC, or a video to take its sound',
      onFiles: async ([f]) => {
        try {
          stop();
          buffer = await decodeAudio(f);
          file = f;
          start = 0;
          end = buffer.duration;
          wave.hidden = false;
          zone.compact(true, `${f.name}, ${formatTime(buffer.duration)}. Drop another to replace it.`);
          peaks = null;
          draw();
          update();
        } catch (err) { toast(err.message); }
      },
    });

    // Waveform: one min/max bar per pixel, the kept part in full colour
    let peaks = null;
    function draw() {
      if (!buffer) return;
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr, hh = canvas.clientHeight * dpr;
      if (!w) return;
      canvas.width = w; canvas.height = hh;
      if (!peaks || peaks.length !== w) {
        const data = buffer.getChannelData(0), step = Math.max(1, Math.floor(data.length / w));
        peaks = new Float32Array(w * 2);
        for (let x = 0; x < w; x++) {
          let lo = 1, hi = -1;
          for (let i = x * step, e = Math.min(data.length, i + step); i < e; i += 4) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
          peaks[x * 2] = lo; peaks[x * 2 + 1] = hi;
        }
      }
      const ctx = canvas.getContext('2d');
      const css = getComputedStyle(document.documentElement);
      const ink = css.getPropertyValue('--ink').trim(), faint = css.getPropertyValue('--line').trim(), accent = css.getPropertyValue('--accent').trim();
      const sx = (start / buffer.duration) * w, ex = (end / buffer.duration) * w;
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = x >= sx && x <= ex ? ink : faint;
        const lo = peaks[x * 2], hi = peaks[x * 2 + 1];
        ctx.fillRect(x, (1 - hi) * hh / 2, 1, Math.max(1, (hi - lo) * hh / 2));
      }
      ctx.fillStyle = accent;
      for (const x of [sx, ex]) {
        ctx.fillRect(x - 1.5 * dpr, 0, 3 * dpr, hh);
        ctx.beginPath();
        ctx.arc(x, hh / 2, 9 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      times.replaceChildren(
        h('span', {}, 'Start ', h('b', {}, formatTime(start))),
        h('span', {}, 'Length ', h('b', {}, formatTime(end - start))),
        h('span', {}, 'End ', h('b', {}, formatTime(end))),
      );
    }

    // Grab whichever handle is closer to the pointer
    let dragging = null;
    const timeAt = (e) => clamp((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth, 0, 1) * buffer.duration;
    canvas.addEventListener('pointerdown', (e) => {
      if (!buffer) return;
      const t = timeAt(e);
      dragging = Math.abs(t - start) < Math.abs(t - end) ? 'start' : 'end';
      canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    const move = (e) => {
      if (!dragging) return;
      const t = timeAt(e);
      if (dragging === 'start') start = Math.min(t, end - 0.1);
      else end = Math.max(t, start + 0.1);
      start = Math.max(0, start); end = Math.min(buffer.duration, end);
      draw();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', () => (dragging = null));
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    const fadeIn = checkbox('Fade in (1 s)', false);
    const fadeOut = checkbox('Fade out (2 s)', false);
    const format = segmented(FORMAT_OPTIONS, '192', null, 'Format');
    function stop() { try { playing?.stop(); } catch { /* already stopped */ } playing = null; play.textContent = 'Play selection'; }
    const play = button('Play selection', () => {
      if (playing) return stop();
      audioCtx.resume();
      const clip = sliceAudio(buffer, start, end, { fadeIn: fadeIn.input.checked ? 1 : 0, fadeOut: fadeOut.input.checked ? 2 : 0 });
      playing = audioCtx.createBufferSource();
      playing.buffer = clip;
      playing.connect(audioCtx.destination);
      playing.onended = stop;
      playing.start();
      play.textContent = 'Stop';
    });
    const go = button('Save audio', () => busy(go, async () => {
      const clip = sliceAudio(buffer, start, end, { fadeIn: fadeIn.input.checked ? 1 : 0, fadeOut: fadeOut.input.checked ? 2 : 0 });
      const blob = await encodeAudio(clip, format.value, (p) => (go.textContent = `Encoding ${Math.round(p * 100)}%`));
      downloadBlob(blob, `${baseName(file.name)}-trimmed.${format.value === 'wav' ? 'wav' : 'mp3'}`);
      update();
    }), 'primary');
    function update() {
      [play, go].forEach((b) => (b.disabled = !buffer));
      go.textContent = 'Save audio';
    }

    work.append(zone, wave);
    side.append(field('Format', format, { hint: 'MP3 is small and plays everywhere. WAV keeps full quality.' }), fadeIn, fadeOut, actions(play, go));
    update();
    return () => { stop(); ro.disconnect(); };
  },
});

// ---------- Convert (also used for video → audio) ----------

function audioBatch(root, { accept, title, hint, verb }) {
  const { work, side } = layout(root);
  let items = [];
  const list = h('div', { class: 'list' });
  const zone = dropzone({
    accept,
    title,
    hint,
    onFiles: async (files) => {
      for (const f of files) {
        const item = { file: f, buffer: null, error: null };
        items.push(item);
        draw();
        try { item.buffer = await decodeAudio(f); } catch (err) { item.error = err.message; }
        draw();
      }
    },
  });
  const format = segmented([['128', 'MP3 128'], ['192', 'MP3 192'], ['320', 'MP3 320'], ['wav', 'WAV']], '192', null, 'Format');
  const go = button(verb, () => busy(go, async () => {
    const ready = items.filter((i) => i.buffer);
    const out = [];
    for (const [n, item] of ready.entries()) {
      const blob = await encodeAudio(item.buffer, format.value, (p) => (go.textContent = `File ${n + 1} of ${ready.length}, ${Math.round(p * 100)}%`));
      out.push({ name: `${baseName(item.file.name)}.${format.value === 'wav' ? 'wav' : 'mp3'}`, blob });
    }
    if (out.length === 1) downloadBlob(out[0].blob, out[0].name);
    else await downloadZip(out, 'audio.zip');
    draw();
  }), 'primary');
  function draw() {
    list.replaceChildren(...items.map((item) => h('div', { class: 'list-item' },
      h('div', { class: 'meta' },
        h('strong', {}, item.file.name),
        h('span', { class: item.error ? 'worse' : '' }, item.error || (item.buffer ? `${formatTime(item.buffer.duration)}, ${item.buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}, ${formatBytes(item.file.size)}` : 'Reading…')),
      ),
      iconBtn('remove', `Remove ${item.file.name}`, () => { items = items.filter((i) => i !== item); draw(); }, 'is-danger'),
    )));
    const n = items.filter((i) => i.buffer).length;
    go.disabled = !n;
    go.textContent = n > 1 ? `${verb} (${n} files)` : verb;
    zone.compact(items.length > 0, 'Add more files');
  }
  work.append(list, zone);
  side.append(field('Save as', format, { hint: 'Higher MP3 numbers sound better and make bigger files.' }), actions(go));
  draw();
}

tool({
  id: 'audio-convert',
  cat: 'audio',
  name: 'Convert audio',
  desc: 'Turn WAV, M4A, OGG or FLAC into MP3, or MP3 into WAV.',
  intro: 'Converts as many files as you like. Everything happens on your device, even for long recordings.',
  keywords: 'convert audio mp3 wav m4a ogg flac aac opus music sound format',
  mount(root) {
    audioBatch(root, { accept: AUDIO_ACCEPT, title: 'Drop audio files here', hint: 'MP3, WAV, M4A, OGG, FLAC and more', verb: 'Convert' });
  },
});

tool({
  id: 'video-to-audio',
  cat: 'audio',
  name: 'Video to MP3',
  desc: 'Take the sound out of a video.',
  intro: 'Saves the sound of a video as MP3 or WAV. Your video stays on your device.',
  keywords: 'video to mp3 audio extract sound mp4 mov webm music',
  mount(root) {
    audioBatch(root, { accept: VIDEO_ACCEPT, title: 'Drop videos here', hint: 'MP4, MOV, WebM and more', verb: 'Save sound' });
  },
});
