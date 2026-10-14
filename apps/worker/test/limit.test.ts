import { describe, expect, it } from "vitest";
import { forEachLimited } from "../src/limit";

describe("forEachLimited", () => {
  it("never runs more than the limit at once and processes every item", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      done.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts nothing new after a failure, lets running items finish, then throws", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    await expect(
      forEachLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 20));
        finished.push(n);
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([1]);
  });
});
