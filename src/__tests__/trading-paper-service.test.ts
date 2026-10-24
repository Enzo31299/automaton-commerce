import { describe, expect, it, vi } from "vitest";
import { createPaperServiceLoop } from "../trading/paper-service.js";

describe("paper service loop", () => {
  it("runs cycles and waits between successful polls", async () => {
    const controller = new AbortController();
    const task = vi.fn(async () => ({ shouldWake: false }));
    const sleep = vi.fn(async () => controller.abort());
    await createPaperServiceLoop(task, 60_000, sleep).run(controller.signal);
    expect(task).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(60_000, controller.signal);
  });

  it("retries market-local failures without a hot loop", async () => {
    const controller = new AbortController();
    const task = vi.fn(async () => ({ shouldWake: true, message: "market failure" }));
    const sleep = vi.fn(async () => controller.abort());
    await createPaperServiceLoop(task, 60_000, sleep).run(controller.signal);
    expect(sleep).toHaveBeenCalledWith(10_000, controller.signal);
  });

  it("propagates fatal task failures to the process supervisor", async () => {
    const task = vi.fn(async () => { throw new Error("checkpoint persistence failed"); });
    await expect(createPaperServiceLoop(task, 60_000).run()).rejects.toThrow("checkpoint persistence failed");
  });

  it("rejects unsafe polling intervals", () => {
    expect(() => createPaperServiceLoop(async () => ({ shouldWake: false }), 9999)).toThrow();
  });
});
