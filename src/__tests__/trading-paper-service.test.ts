import { describe, expect, it, vi } from "vitest";
import { createPaperServiceLoop } from "../trading/paper-service.js";

describe("paper service loop", () => {
  it("runs cycles and waits between successful polls", async () => {
    const controller = new AbortController();
    const task = vi.fn(async () => ({ shouldWake: false, failedMarkets: 0, totalMarkets: 3 }));
    const sleep = vi.fn(async () => controller.abort());
    await createPaperServiceLoop(task, 60_000, sleep).run(controller.signal);
    expect(task).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(60_000, controller.signal);
  });

  it("retries partial market failures without restarting", async () => {
    const controller = new AbortController();
    let cycles = 0;
    const task = vi.fn(async () => ({ shouldWake: true, failedMarkets: 1, totalMarkets: 3, message: "market failure" }));
    const sleep = vi.fn(async () => {
      cycles += 1;
      if (cycles === 8) controller.abort();
    });
    await createPaperServiceLoop(task, 60_000, sleep, 3).run(controller.signal);
    expect(task).toHaveBeenCalledTimes(8);
    expect(sleep).toHaveBeenCalledWith(10_000, controller.signal);
  });

  it("fails after repeated total market outages", async () => {
    const task = vi.fn(async () => ({ shouldWake: true, failedMarkets: 3, totalMarkets: 3, message: "all markets unavailable" }));
    const sleep = vi.fn(async () => {});
    await expect(createPaperServiceLoop(task, 60_000, sleep, 3).run())
      .rejects.toThrow(/failed all 3 markets for 3 consecutive cycles/);
    expect(task).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("resets the outage counter when any market recovers", async () => {
    const controller = new AbortController();
    const results = [
      { shouldWake: true, failedMarkets: 3, totalMarkets: 3 },
      { shouldWake: true, failedMarkets: 3, totalMarkets: 3 },
      { shouldWake: true, failedMarkets: 2, totalMarkets: 3 },
      { shouldWake: true, failedMarkets: 3, totalMarkets: 3 },
      { shouldWake: true, failedMarkets: 3, totalMarkets: 3 },
    ];
    const task = vi.fn(async () => results.shift() ?? { shouldWake: false, failedMarkets: 0, totalMarkets: 3 });
    let sleeps = 0;
    const sleep = vi.fn(async () => {
      sleeps += 1;
      if (sleeps === 5) controller.abort();
    });
    await createPaperServiceLoop(task, 60_000, sleep, 3).run(controller.signal);
    expect(task).toHaveBeenCalledTimes(5);
  });

  it("propagates fatal task failures to the process supervisor", async () => {
    const task = vi.fn(async () => { throw new Error("checkpoint persistence failed"); });
    await expect(createPaperServiceLoop(task, 60_000).run()).rejects.toThrow("checkpoint persistence failed");
  });

  it("rejects unsafe polling and failure threshold configuration", () => {
    expect(() => createPaperServiceLoop(async () => ({ shouldWake: false, failedMarkets: 0, totalMarkets: 1 }), 9999)).toThrow();
    expect(() => createPaperServiceLoop(async () => ({ shouldWake: false, failedMarkets: 0, totalMarkets: 1 }), 60_000, undefined, 0)).toThrow();
  });
});
