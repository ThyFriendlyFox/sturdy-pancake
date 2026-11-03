// Pure helpers for binary masks (1 byte per pixel, nonzero = subject).

export interface MaskStats {
  area: number; // fraction of the frame, 0..1
  cx: number; // center, 0..1
  cy: number;
  box: [number, number, number, number]; // x0, y0, x1, y1, 0..1
}

/** Keep only the largest 4-connected region. Removes speckles the model leaves around the subject. */
export function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0,
    bestSize = 0,
    next = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue;
    next++;
    let size = 0,
      sp = 0;
    stack[sp++] = i;
    label[i] = next;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of n) {
        if (q < 0 || q >= w * h || !mask[q] || label[q]) continue;
        label[q] = next;
        stack[sp++] = q;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const out = new Uint8Array(w * h);
  if (!best) return out;
  for (let i = 0; i < w * h; i++) if (label[i] === best) out[i] = 255;
  return out;
}

export function maskStats(mask: Uint8Array, w: number, h: number): MaskStats {
  let n = 0,
    sx = 0,
    sy = 0,
    x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      n++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (!n) return { area: 0, cx: 0.5, cy: 0.5, box: [0, 0, 0, 0] };
  return { area: n / (w * h), cx: sx / n / w, cy: sy / n / h, box: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h] };
}

/** A point inside the mask close to its center, used as the next tracking prompt. */
export function innerPoint(mask: Uint8Array, w: number, h: number): [number, number] | null {
  const s = maskStats(mask, w, h);
  if (!s.area) return null;
  const cx = Math.round(s.cx * w),
    cy = Math.round(s.cy * h);
  if (mask[cy * w + cx]) return [s.cx, s.cy];
  // Center falls outside (e.g. a curled shape): take the nearest mask pixel.
  let best: [number, number] | null = null,
    bd = Infinity;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      if (!mask[y * w + x]) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = [x / w, y / h];
      }
    }
  return best;
}

/** Keyframe times for following a subject through [a, b], every `step` seconds, starting at t0. */
export function followTimes(a: number, b: number, t0: number, step: number): { forward: number[]; backward: number[] } {
  const forward: number[] = [],
    backward: number[] = [];
  for (let t = t0 + step; t <= b + 1e-6; t += step) forward.push(+t.toFixed(3));
  for (let t = t0 - step; t >= a - 1e-6; t -= step) backward.push(+t.toFixed(3));
  return { forward, backward };
}

/** Index of the keyframe nearest to t in a sorted list. */
export function nearest(times: number[], t: number): number {
  if (!times.length) return -1;
  let lo = 0,
    hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}
