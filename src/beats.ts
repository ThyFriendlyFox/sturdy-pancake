// Beat finder, from FastCut: low-pass to hear the kick, onset envelope, tempo by autocorrelation.
export type SongInfo = { bpm: number; beats: number[]; peaks: number[]; duration: number };

export async function detectBeats(url: string): Promise<SongInfo> {
  const buf = await (await fetch(url)).arrayBuffer();
  const sr = 22050;
  const tmp = new OfflineAudioContext(1, sr, sr);
  const decoded = await tmp.decodeAudioData(buf);
  // waveform for the audio strip
  const raw = decoded.getChannelData(0);
  const bins = 600;
  const per = Math.max(1, Math.floor(raw.length / bins));
  const peaks: number[] = [];
  for (let b = 0; b < bins; b++) {
    let m = 0;
    for (let j = b * per; j < (b + 1) * per && j < raw.length; j += 4) m = Math.max(m, Math.abs(raw[j]));
    peaks.push(m);
  }
  const top = Math.max(...peaks) || 1;
  for (let b = 0; b < bins; b++) peaks[b] /= top;
  const len = Math.min(decoded.duration, 240);
  const off = new OfflineAudioContext(1, Math.ceil(len * sr), sr);
  const src = off.createBufferSource();
  src.buffer = decoded;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  src.connect(lp).connect(off.destination);
  src.start();
  const low = (await off.startRendering()).getChannelData(0);

  const hop = 256;
  const n = Math.floor(low.length / hop);
  const env = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) s += low[j] * low[j];
    const e = Math.sqrt(s / hop);
    env[i] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = sr / hop;
  // tempo: autocorrelation over 70..180 BPM, nudged towards ~120
  let bestLag = 0;
  let best = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let i = 0; i + lag * 4 < n; i++) {
      const a = env[i];
      if (!a) continue;
      s += a * (interp(env, i + lag) + 0.5 * interp(env, i + 2 * lag) + 0.25 * interp(env, i + 4 * lag));
    }
    s *= Math.exp(-Math.pow(Math.log2(bpm / 120), 2) * 0.8);
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  // phase: where the grid lines up with the most energy
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let ph = 0; ph < bestLag; ph += 0.5) {
    let s = 0;
    for (let k = ph; k < n; k += bestLag) s += interp(env, k);
    if (s > bestSum) {
      bestSum = s;
      bestPhase = ph;
    }
  }
  const period = bestLag / fps;
  const beats: number[] = [];
  for (let t = bestPhase / fps; t < len; t += period) beats.push(t);
  return { bpm: Math.round(60 / period), beats, peaks, duration: decoded.duration };
}

function interp(a: Float32Array, x: number) {
  const i = Math.floor(x);
  if (i + 1 >= a.length) return 0;
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}
