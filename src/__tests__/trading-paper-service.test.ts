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

  it("retries partial market failures without escalating