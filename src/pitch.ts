// Real-time pitch shifter (two crossfaded delay taps). Changes pitch without changing speed.
export const PITCH_WORKLET = `
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: "ratio", defaultValue: 1, minValue: 0.25, maxValue: 4 }]; }
  constructor() {
    super();
    this.N = 16384;
    this.win = 2048;
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0;
    this.phase = 0;
  }
  read(b, d) {
    let p = this.w - d - 1;
    while (p < 0) p += this.N;
    const i = Math.floor(p), f = p - i;
    return b[i % this.N] * (1 - f) + b[(i + 1) % this.N] * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    const ratio = params.ratio[0];
    const n = out[0] ? out[0].length : 128;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < out.length; c++) {
        const src = inp[c] || inp[0];
        this.buf[c % 2][this.w] = src ? src[i] : 0;
      }
      if (Math.abs(ratio - 1) < 1e-3) {
        for (let c = 0; c < out.length; c++) out[c][i] = this.buf[c % 2][this.w];
      } else {
        this.phase += (1 - ratio) / this.win;
        this.phase -= Math.floor(this.phase);
        const p2 = (this.phase + 0.5) % 1;
        const g1 = Math.sin(Math.PI * this.phase) ** 2, g2 = Math.sin(Math.PI * p2) ** 2;
        for (let c = 0; c < out.length; c++) {
          const b = this.buf[c % 2];
          out[c][i] = this.read(b, this.phase * this.win) * g1 + this.read(b, p2 * this.win) * g2;
        }
      }
      this.w = (this.w + 1) % this.N;
    }
    return true;
  }
}
registerProcessor("pitch-shifter", PitchShifter);
`;
