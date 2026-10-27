// Video tools, built on the browser's own video player: no big converter to download.
// Trimming re-records the chosen part while it plays, so saving takes as long as the clip.

const VIDEO_FILES = 'video/*,.mp4,.mov,.webm,.mkv,.m4v';

// The video with a filmstrip timeline and two orange handles for start and end
function videoTimeline(video, onChange) {
  const strip = h('div', { class: 'film-strip' });
  const sel = h('div', { class: 'film-sel' }, h('span', { class: 'film-handle', 'data-h': 'start' }), h('span', { class: 'film-handle', 'data-h': 'end' }));
  const head = h('div', { class: 'film-head' });
  const track = h('div', { class: 'film-track' }, strip, sel, head);
  const times = h('div', { class: 'time-row' });
  const el = h('div', { class: 'wave-wrap' }, track, times);
  const t = { start: 0, end: 0, el };

  const draw = () => {
    const d = video.duration || 1;
    Object.assign(sel.style, { left: `${(t.start / d) * 100}%`, width: `${((t.end - t.start) / d) * 100}%` });
    times.replaceChildren(
      h('span', {}, 'Start ', h('b', {}, formatTime(t.start))),
      h('span', {}, 'Length ', h('b', {}, formatTime(t.end - t.start))),
      h('span', {}, 'End ', h('b', {}, formatTime(t.end))),
    );
  };
  video.addEventListener('timeupdate', () => { head.style.left = `${(video.currentTime / (video.duration || 1)) * 100}%`; });

  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    const r = track.getBoundingClientRect();
    const at = clamp((e.clientX - r.left) / r.width, 0, 1) * video.duration;
    drag = e.target.dataset.h || (Math.abs(at - t.start) < Math.abs(at - t.end) ? 'start' : 'end');
    track.setPointerCapture(e.pointerId);
    move(e);
  });
  const move = (e) => {
    if (!drag) return;
    const r = track.getBoundingClientRect();
    const at = clamp((e.clientX - r.left) / r.width, 0, 1) * video.duration;
    if (drag === 'start') t.start = Math.min(at, t.end - 0.2);
    else t.end = Math.max(at, t.start + 0.2);
    t.start = Math.max(0, t.start); t.end = Math.min(video.duration, t.end);
    video.currentTime = drag === 'start' ? t.start : t.end;
    draw();
    onChange?.();
  };
  track.addEventListener('pointermove', move);
  track.addEventListener('pointerup', () => (drag = null));

  // A row of frames along the track, taken from a second, hidden copy of the video
  t.load = async () => {
    t.start = 0;
    t.end = video.duration;
    draw();
    const copy = h('video', { muted: true, playsInline: true, preload: 'auto', src: video.src });
    await new Promise((r) => copy.addEventListener('loadeddata', r, { once: true }));
    const n = 10;
    const frames = [];
    for (let i = 0; i < n; i++) {
      copy.currentTime = (video.duration * (i + 0.5)) / n;
      await new Promise((r) => copy.addEventListener('seeked', r, { once: true }));
      const c = h('canvas', { width: 160, height: Math.round(160 * copy.videoHeight / copy.videoWidth) || 90 });
      c.getContext('2d').drawImage(copy, 0, 0, c.width, c.height);
      frames.push(c);
    }
    strip.replaceChildren(...frames);
    copy.removeAttribute('src');
  };
  return t;
}

const seekTo = (video, time) => new Promise((r) => {
  if (Math.abs(video.currentTime - time) < 0.001) return r();   // no seek, no "seeked" event
  video.addEventListener('seeked', r, { once: true });
  video.currentTime = time;
});

function videoTool(root, { title, onReady, controls }) {
  const { work, side } = layout(root);
  const video = h('video', { class: 'video-player', controls: true, playsInline: true, hidden: true });
  const state = { file: null, video, timeline: null };
  const holder = h('div', { hidden: true });
  const zone = dropzone({
    accept: VIDEO_FILES,
    multiple: false,
    title,
    hint: 'MP4, MOV, WebM. Your browser has to be able to play it.',
    onFiles: async ([f]) => {
      if (video.src) URL.revokeObjectURL(video.src);
      state.file = f;
      video.src = URL.createObjectURL(f);
      video.hidden = false;
      try {
        await new Promise((resolve, reject) => {
          video.addEventListener('loadedmetadata', resolve, { once: true });
          video.addEventListener('error', () => reject(new Error(`${f.name} can't be played in this browser`)), { once: true });
        });
      } catch (err) { toast(err.message); return; }
      // Recorded WebMs often don't say how long they are: jumping far ahead makes the browser find out
      if (!isFinite(video.duration)) {
        await new Promise((resolve) => {
          const found = () => {
            if (!isFinite(video.duration)) return;
            video.removeEventListener('durationchange', found);
            resolve();
          };
          video.addEventListener('durationchange', found);
          video.currentTime = 1e101;
        });
        await seekTo(video, 0);
      }
      zone.compact(true, `${f.name}, ${formatTime(video.duration)}. Drop another to replace it.`);
      state.timeline ||= videoTimeline(video, () => onReady?.(state));
      holder.replaceChildren(state.timeline.el);
      holder.hidden = false;
      await state.timeline.load();
      onReady?.(state);
    },
  });
  work.append(zone, video, holder);
  side.append(...controls(state));
  return state;
}

// ---------- Trim ----------

function recorderType() {
  const options = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return options.find((t) => window.MediaRecorder?.isTypeSupported(t));
}

tool({
  id: 'video-trim',
  cat: 'audio',
  name: 'Trim a video',
  desc: 'Cut the start and end off a video.',
  intro: 'Drag the orange handles. When you save, the clip plays once while it is recorded, so it takes as long as the clip.',
  keywords: 'video trim cut shorten clip mp4 mov webm schneiden kürzen',
  mount(root) {
    let state;
    const info = h('p', { class: 'note' }, 'Add a video to start.');
    const go = button('Save clip', () => busy(go, async () => {
      const { video, timeline: t, file } = state;
      const type = recorderType();
      if (!type) throw new Error('This browser can\'t record video. Try Chrome, Edge or Firefox.');
      const stream = (video.captureStream || video.mozCaptureStream).call(video);
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      await seekTo(video, t.start);
      video.muted = false;
      rec.start(250);
      await video.play();
      // A timer, not animation frames: those pause when the tab is in the background
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          go.textContent = `Recording ${Math.round(((video.currentTime - t.start) / (t.end - t.start)) * 100)}%`;
          if (video.currentTime >= t.end || video.ended) { clearInterval(timer); resolve(); }
        }, 50);
      });
      video.pause();
      rec.stop();
      await stopped;
      const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
      downloadBlob(new Blob(chunks, { type: type.split(';')[0] }), `${baseName(file.name)}-clip.${ext}`);
      go.textContent = 'Save clip';
    }), 'primary');
    go.disabled = true;
    state = videoTool(root, {
      title: 'Drop a video here',
      onReady: (s) => {
        go.disabled = false;
        const type = recorderType();
        info.textContent = `The clip is saved as ${type?.startsWith('video/mp4') ? 'MP4' : 'WebM'}.`;
      },
      controls: () => [info, actions(go)],
    });
  },
});

// ---------- GIF ----------

tool({
  id: 'video-to-gif',
  cat: 'audio',
  name: 'Video to GIF',
  desc: 'Turn a short part of a video into a GIF.',
  intro: 'Pick up to 15 seconds. Smaller and slower GIFs make much smaller files.',
  keywords: 'gif animated video to gif mp4 meme clip',
  mount(root) {
    let state;
    const info = h('p', { class: 'note' }, 'Add a video to start.');
    const width = segmented([['320', 'Small'], ['480', 'Medium'], ['640', 'Large']], '480', null, 'Size');
    const fps = segmented([['8', '8 fps'], ['12', '12 fps'], ['15', '15 fps']], '12', null, 'Smoothness');
    const go = button('Make GIF', () => busy(go, async () => {
      const { video, timeline: t, file } = state;
      const { GIFEncoder, quantize, applyPalette } = await needModule('gifenc');
      const length = Math.min(15, t.end - t.start);
      const rate = Number(fps.value);
      const w = Math.min(Number(width.value), video.videoWidth);
      const hh = Math.round(w * video.videoHeight / video.videoWidth);
      const c = h('canvas', { width: w, height: hh });
      const g = c.getContext('2d', { willReadFrequently: true });
      const gif = GIFEncoder();
      const frames = Math.max(1, Math.round(length * rate));
      video.pause();
      for (let i = 0; i < frames; i++) {
        go.textContent = `Frame ${i + 1} of ${frames}`;
        await seekTo(video, t.start + i / rate);
        g.drawImage(video, 0, 0, w, hh);
        const { data } = g.getImageData(0, 0, w, hh);
        const palette = quantize(data, 256);
        gif.writeFrame(applyPalette(data, palette), w, hh, { palette, delay: Math.round(1000 / rate) });
      }
      gif.finish();
      const blob = new Blob([gif.bytes()], { type: 'image/gif' });
      downloadBlob(blob, `${baseName(file.name)}.gif`);
      go.textContent = 'Make GIF';
    }), 'primary');
    go.disabled = true;
    const update = () => {
      if (!state?.timeline) return;
      const len = state.timeline.end - state.timeline.start;
      info.textContent = len > 15 ? `The selection is ${formatTime(len)}. Only the first 15 seconds go into the GIF.` : `${formatTime(len)} selected.`;
    };
    state = videoTool(root, {
      title: 'Drop a video here',
      onReady: () => { go.disabled = false; update(); },
      controls: () => [info, field('Size', width), field('Smoothness', fps), actions(go)],
    });
  },
});
