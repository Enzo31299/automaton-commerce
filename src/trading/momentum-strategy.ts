import type { Candle, Signal, Strategy } from "./strategy.js";

export class MomentumStrategy implements Strategy {
  readonly name = "momentum";

  constructor(
    private readonly lookback = 20,
    private readonly thresholdPct = 2,
  ) {
    if (lookback < 1 || thresholdPct < 0) throw new Error("Invalid momentum parameters");
  }

  signal(history: readonly Candle[]): Signal {
    if (history.length <= this.lookback) return "hold";
    const current = history.at(-1)!.close;
    const previous = history.at(-(this.lookback + 1))!.close;
    const changePct = ((current / previous) - 1) * 100;
    if (changePct >= this.thresholdPct) return "buy";
    if (changePct <= -this.thresholdPct) return "sell";
    return "hold";
  }
}
