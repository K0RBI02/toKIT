// Cuts Korbi's pose images out of their background at runtime, same method as k0rbi02.github.io:
// flood-fill the neutral white (and the painted-on grey checkerboard) from the borders, so the
// warm off-white shirt stays opaque, then soften the edge pixels that are still close to white.

async function cutOut(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#FEFEFE';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, W, H);
  const px = data.data;
  const whiteness = (i) => Math.min(px[i], px[i + 1], px[i + 2]);
  const isBg = (i) => whiteness(i) >= 232 && Math.max(px[i], px[i + 1], px[i + 2]) - whiteness(i) <= 3;

  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !isBg(p * 4)) continue;
    seen[p] = 1;
    px[p * 4 + 3] = 0;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  // The checkerboard also shows through closed gaps (between arm and body): clear enclosed patches
  // that are partly checker grey; plain white patches (shirt highlights) stay
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !isBg(s * 4)) continue;
    const patch = [s];
    let grey = 0;
    seen[s] = 2;
    for (let k = 0; k < patch.length; k++) {
      const p = patch[k];
      if (whiteness(p * 4) < 247) grey++;
      const x = p % W, y = (p / W) | 0;
      for (const q of [x > 0 && p - 1, x < W - 1 && p + 1, y > 0 && p - W, y < H - 1 && p + W]) {
        if (q !== false && !seen[q] && isBg(q * 4)) { seen[q] = 2; patch.push(q); }
      }
    }
    const clear = patch.length > 150 && grey > patch.length * 0.2;
    for (const p of patch) {
      if (clear) { seen[p] = 1; px[p * 4 + 3] = 0; } else seen[p] = 3;
    }
  }

  for (let p = 0; p < W * H; p++) {
    if (seen[p] === 1) continue;
    const x = p % W, y = (p / W) | 0;
    const touches = (x > 0 && seen[p - 1] === 1) || (x < W - 1 && seen[p + 1] === 1) || (y > 0 && seen[p - W] === 1) || (y < H - 1 && seen[p + W] === 1);
    if (!touches) continue;
    const w = whiteness(p * 4);
    if (w > 200) px[p * 4 + 3] = Math.round(255 * Math.max(0, (255 - w) / 55));
  }

  g.putImageData(data, 0, 0);
  return c;
}

// The pose, cut out and trimmed to the figure
async function cutOutPose(src) {
  const c = await cutOut(src);
  const { width: W, height: H } = c;
  const px = c.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let p = 0; p < W * H; p++) {
    if (px[p * 4 + 3] < 128) continue;
    const x = p % W, y = (p / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const t = document.createElement('canvas');
  t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
  t.getContext('2d').drawImage(c, -x0, -y0);
  return { url: t.toDataURL('image/png') };
}
