import { describe, expect, it } from "vitest";
import { createHourlyResearchWindow } from "../trading/research-window.js";

describe("OOS research window", () => {
  it("returns epoch seconds aligned to the previous completed hour", () => {
    const now = Date.parse("2026-10-24T13:37:42.000Z");
    const { start, end } = createHourlyResearchWindow(now, 180);

    expect(end).toBe(Date.parse("2026-10-24T12:00:00.000Z") / 1000);
    expect(start).toBe(end - 180 * 24 * 60 * 60);
    expect(end).toBeLessThan(10_000_000_000);
    expect(end % 3600).toBe(0);
  });

  it("excludes the current hour when called exactly on an hour boundary", () => {
    const now = Date.parse("2026-10-24T13:00:00.000Z");
    expect(createHourlyResearchWindow(now, 1).end)
      .toBe(Date.parse("2026-10-24T12:00:00.000Z") / 1000);
  });

  it("rejects invalid clocks and lookbacks", () => {
    expect(() => createHourlyResearchWindow(Number.NaN)).toThrow(/clock/);
    expect(() => createHourlyResearchWindow(Date.now(), 0)).toThrow(/lookback/);
    expect(() => createHourlyResearchWindow(Date.now(), 1.5)).toThrow(/lookback/);
  });
});
