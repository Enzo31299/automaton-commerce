export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Signal = "buy" | "sell" | "hold";

export interface Strategy {
  readonly name: string;
  signal(history: readonly Candle[]): Signal;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export class MovingAverageCrossStrategy implements Strategy {
  readonly name = "moving-average-cross";

  constructor(
    private readonly fastPeriod = 20,
    private readonly slowPeriod = 50,
  ) {
    if (fastPeriod < 1 || slowPeriod <= fastPeriod) {
      throw new Error("Expected 0 < fastPeriod < slowPeriod");
    }
  }

  signal(history: readonly Candle[]): Signal {
    if (history.length < this.slowPeriod + 1) return "hold";

    const closes = history.map((candle) => candle.close);
    const previous = closes.slice(0, -1);
    const fastNow = average(closes.slice(-this.fastPeriod));
    const slowNow = average(closes.slice(-this.slowPeriod));
    const fastPrevious = average(previous.slice(-this.fastPeriod));
    const slowPrevious = average(previous.slice(-this.slowPeriod));

    if (fastPrevious <= slowPrevious && fastNow > slowNow) return "buy";
    if (fastPrevious >= slowPrevious && fastNow < slowNow) return "sell";
    return "hold";
  }
}
