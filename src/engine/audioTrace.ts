import type { Interest, RowResult, Scene, Viewport } from "../types";
import { axisValue, axisInverse } from "../graph/render";
export type TraceCurve = {
  row: RowResult;
  segments: number[][];
  points: Interest[];
  vertical: boolean;
};
export function traceCurve(scene: Scene, row: RowResult): TraceCurve {
  const segments: number[][] = [],
    points: Interest[] = [];
  for (const g of row.geometry) {
    if (g.kind === "triangles") continue;
    let previous: number[] | null = null;
    for (let i = g.start; i + 1 < g.start + g.count; i += 2) {
      const x = scene.data[i],
        y = scene.data[i + 1];
      if (!Number.isFinite(x + y)) {
        previous = null;
        continue;
      }
      if (g.kind === "points") points.push({ x, y, kind: "point" });
      else if (previous && (g.kind !== "segments" || (i - g.start) % 4 === 2))
        segments.push([...previous, x, y]);
      previous = [x, y];
    }
  }
  const vertical =
    segments.length > 0 && segments.every((s) => Math.abs(s[0] - s[2]) < 1e-9);
  return { row, segments, points, vertical };
}
export function traceAt(
  curve: TraceCurve,
  view: Viewport,
  fraction: number,
): Interest[] {
  const vertical = curve.vertical,
    min = vertical ? view.yMin : view.xMin,
    max = vertical ? view.yMax : view.xMax,
    log = vertical ? view.yLog : view.xLog;
  const input = axisInverse(
    axisValue(min, log) +
      Math.max(0, Math.min(1, fraction)) *
        (axisValue(max, log) - axisValue(min, log)),
    log,
  );
  const found: Interest[] = [];
  for (const s of curve.segments) {
    const a = vertical ? s[1] : s[0],
      b = vertical ? s[3] : s[2];
    if (
      input < Math.min(a, b) - 1e-12 ||
      input > Math.max(a, b) + 1e-12 ||
      a === b
    )
      continue;
    const t = (input - a) / (b - a),
      x = s[0] + t * (s[2] - s[0]),
      y = s[1] + t * (s[3] - s[1]);
    if (x < view.xMin || x > view.xMax || y < view.yMin || y > view.yMax)
      continue;
    if (!found.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-7))
      found.push({ x, y, kind: "trace" });
  }
  if (!curve.segments.length && curve.points.length) {
    const p = curve.points.reduce((a, b) =>
      Math.abs((vertical ? b.y : b.x) - input) <
      Math.abs((vertical ? a.y : a.x) - input)
        ? b
        : a,
    );
    found.push(p);
  }
  return found.sort((a, b) => (vertical ? a.x - b.x : a.y - b.y));
}
export class TraceSound {
  private context: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private noise: AudioBuffer | null = null;
  private generation = 0;
  stop() {
    this.generation++;
    for (const node of this.nodes)
      try {
        node.stop();
      } catch {}
    this.nodes = [];
  }
  async play(
    curve: TraceCurve,
    view: Viewport,
    volume: number,
    duration: number,
    fixed?: Interest[],
  ) {
    this.stop();
    const generation = this.generation;
    const ctx = (this.context ??= new AudioContext());
    await ctx.resume();
    if (generation !== this.generation || ctx.state === "closed") return;
    this.noise ??= (() => {
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate),
        d = b.getChannelData(0);
      let state = 0x12345;
      for (let i = 0; i < d.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        d[i] = (state >>> 0) / 2147483648 - 1;
      }
      return b;
    })();
    const samples = 500,
      start = ctx.currentTime + 0.02;
    const values = Array.from(
      { length: samples + 1 },
      (_, i) => fixed ?? traceAt(curve, view, i / samples),
    );
    const voices = Math.min(16, Math.max(1, ...values.map((v) => v.length)));
    for (let voice = 0; voice < voices; voice++) {
      const osc = ctx.createOscillator(),
        harmonic = ctx.createOscillator(),
        gain = ctx.createGain(),
        harmonicGain = ctx.createGain(),
        pan = ctx.createStereoPanner(),
        noise = ctx.createBufferSource(),
        noiseGain = ctx.createGain();
      osc.connect(gain);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(gain);
      noise.buffer = this.noise;
      noise.loop = true;
      noise.connect(noiseGain);
      noiseGain.connect(pan);
      gain.connect(pan);
      pan.connect(ctx.destination);
      for (let i = 0; i <= samples; i++) {
        const p = values[i][voice],
          time = start + (i / samples) * duration;
        if (!p) {
          gain.gain.setValueAtTime(0, time);
          noiseGain.gain.setValueAtTime(0, time);
          continue;
        }
        const output = curve.vertical ? p.x : p.y,
          input = curve.vertical ? p.y : p.x,
          lo = curve.vertical ? view.xMin : view.yMin,
          hi = curve.vertical ? view.xMax : view.yMax;
        const pitch = 150 * 2 ** ((3 * (output - lo)) / (hi - lo));
        osc.frequency.setValueAtTime(pitch, time);
        harmonic.frequency.setValueAtTime(pitch * 2, time);
        harmonicGain.gain.setValueAtTime(input >= 0 ? 0.2 : 0, time);
        gain.gain.setValueAtTime((volume * 0.001) / Math.sqrt(voices), time);
        noiseGain.gain.setValueAtTime(
          output < 0 ? (volume * 0.00018) / Math.sqrt(voices) : 0,
          time,
        );
        const inputMin = curve.vertical ? view.yMin : view.xMin;
        const inputMax = curve.vertical ? view.yMax : view.xMax;
        pan.pan.setValueAtTime(
          Math.max(
            -1,
            Math.min(1, -1 + (2 * (input - inputMin)) / (inputMax - inputMin)),
          ),
          time,
        );
      }
      let ended = 0;
      for (const node of [osc, harmonic, noise]) {
        node.start(start);
        node.stop(start + duration);
        node.onended = () => {
          node.disconnect();
          this.nodes = this.nodes.filter((n) => n !== node);
          if (++ended === 3)
            for (const n of [gain, harmonicGain, noiseGain, pan])
              n.disconnect();
        };
        this.nodes.push(node);
      }
    }
    for (const p of fixed
      ? []
      : curve.row.points.filter((p) => p.kind === "intersection")) {
      const fraction =
        (curve.vertical ? p.y - view.yMin : p.x - view.xMin) /
        (curve.vertical ? view.yMax - view.yMin : view.xMax - view.xMin);
      if (fraction < 0 || fraction > 1) continue;
      const pop = ctx.createOscillator(),
        g = ctx.createGain();
      pop.frequency.value = 90;
      g.gain.setValueAtTime(volume * 0.002, start + fraction * duration);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        start + fraction * duration + 0.025,
      );
      pop.connect(g);
      g.connect(ctx.destination);
      pop.start(start + fraction * duration);
      pop.stop(start + fraction * duration + 0.03);
      pop.onended = () => {
        pop.disconnect();
        g.disconnect();
        this.nodes = this.nodes.filter((n) => n !== pop);
      };
      this.nodes.push(pop);
    }
  }
  async point(
    curve: TraceCurve,
    view: Viewport,
    fraction: number,
    volume: number,
  ) {
    const points = traceAt(curve, view, fraction);
    if (!points.length) return;
    await this.play(curve, view, volume, 0.09, points);
  }
  close() {
    this.stop();
    void this.context?.close();
    this.context = null;
  }
}
