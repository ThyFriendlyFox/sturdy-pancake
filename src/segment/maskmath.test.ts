import { describe, expect, it } from "vitest";
import { followTimes, innerPoint, largestComponent, maskStats, nearest } from "./maskmath";

const grid = (rows: string[]) => {
  const h = rows.length,
    w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === "#" ? 255 : 0)));
  return { m, w, h };
};

describe("mask math", () => {
  it("keeps the largest region only", () => {
    const { m, w, h } = grid(["##..#", "##...", "....#"]);
    const out = largestComponent(m, w, h);
    expect([...out].filter(Boolean).length).toBe(4);
    expect(out[4]).toBe(0);
  });

  it("measures center and box", () => {
    const { m, w, h } = grid(["....", ".##.", ".##.", "...."]);
    const s = maskStats(m, w, h);
    expect(s.area).toBeCloseTo(0.25);
    expect([s.cx, s.cy]).toEqual([0.375, 0.375]);
    expect(s.box).toEqual([0.25, 0.25, 0.75, 0.75]);
  });

  it("finds a point inside a curled shape", () => {
    const { m, w, h } = grid(["######", "#....#", "#....#", "#....#"]);
    const p = innerPoint(m, w, h)!;
    const [x, y] = [Math.floor(p[0] * w), Math.floor(p[1] * h)];
    expect(m[y * w + x]).toBe(255);
  });

  it("plans keyframes both ways from the tap", () => {
    expect(followTimes(0, 1, 0.5, 0.25)).toEqual({ forward: [0.75, 1], backward: [0.25, 0] });
  });

  it("picks the nearest keyframe", () => {
    expect(nearest([0, 0.25, 0.5, 1], 0.4)).toBe(2);
    expect(nearest([0, 0.25, 0.5, 1], 0.1)).toBe(0);
    expect(nearest([0, 0.25, 0.5, 1], 9)).toBe(3);
  });
});
