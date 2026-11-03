import { describe, expect, it } from "vitest";
import { deleteRange, emptyProject, layout, newClip, splitAt, splitEvery, totalDuration, type Media, type Project } from "./model";

const vid = (id: string, duration: number): Media => ({ id, name: id, kind: "video", duration, width: 1920, height: 1080 });
const proj = (...lens: number[]): Project => ({ ...emptyProject(), clips: lens.map((l, i) => newClip(vid("m" + i, l))) });

describe("timeline math", () => {
  it("lays clips end to end and respects speed", () => {
    const p = proj(4, 6);
    p.clips[1].speed = 2;
    expect(layout(p).map((x) => [x.start, x.end])).toEqual([
      [0, 4],
      [4, 7],
    ]);
    expect(totalDuration(p)).toBe(7);
  });

  it("splits a clip at a timeline time", () => {
    const p = splitAt(proj(4, 6), 6);
    expect(p.clips).toHaveLength(3);
    expect([p.clips[1].in, p.clips[1].out, p.clips[2].in, p.clips[2].out]).toEqual([0, 2, 2, 6]);
    expect(totalDuration(p)).toBe(10);
  });

  it("ignores splits at clip edges", () => {
    const p = proj(4, 6);
    expect(splitAt(p, 4)).toBe(p);
  });

  it("ripple-deletes a range across clips", () => {
    const p = deleteRange(proj(4, 6), 3, 5);
    expect(totalDuration(p)).toBeCloseTo(8);
    expect(p.clips.map((c) => [c.in, c.out])).toEqual([
      [0, 3],
      [1, 6],
    ]);
  });
});

describe("splitEvery", () => {
  it("cuts the track on a fixed grid", () => {
    const p = splitEvery(proj(4, 6), 2);
    const l = layout(p);
    expect(l.map((x) => +x.start.toFixed(2))).toEqual([0, 2, 4, 6, 8]);
    expect(totalDuration(p)).toBe(10);
  });
});
