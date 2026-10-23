import type { ExecutionResult, TradeIntent } from "./types.js";

export interface ExecutionAdapter {
  execute(intent: TradeIntent): Promise<ExecutionResult>;
}

export interface PaperExecutionConfig {
  feeRate?: number;
  slippageRate?: number;
}

export class PaperExecutionAdapter implements ExecutionAdapter {
  private sequence = 0;
  private readonly feeRate: number;
  private readonly slippageRate: number;

  constructor(config: PaperExecutionConfig = {}) {
    this.feeRate = config.feeRate ?? 0;
    this.slippageRate = config.slippageRate ?? 0;
    if (!Number.isFinite(this.feeRate) || this.feeRate < 0) throw new Error("Paper fee rate must be non-negative");
    if (!Number.isFinite(this.slippageRate) || this.slippageRate < 0 || this.slippageRate >= 1) {
      throw new Error("Paper slippage rate must be between 0 and 1");
    }
  }

  async execute(intent: TradeIntent): Promise<ExecutionResult> {
    this.sequence += 1;
    const slippageMultiplier = intent.side === "buy" ? 1 + this.slippageRate : 1 - this.slippageRate;
    const fillPrice = intent.price * slippageMultiplier;
    const notional = intent.quantity * fillPrice;
    return {
      id: `paper-${this.sequence}`,
      mode: "paper",
      symbol: intent.symbol,
      side: intent.side,
      quantity: intent.quantity,
      fillPrice,
      notional,
      fee: notional * this.feeRate,
      timestamp: Date.now(),
    };
  }
}
