import type { ExecutionResult, TradeIntent } from "./types.js";

export interface ExecutionAdapter {
  execute(intent: TradeIntent): Promise<ExecutionResult>;
}

export class PaperExecutionAdapter implements ExecutionAdapter {
  private sequence = 0;

  async execute(intent: TradeIntent): Promise<ExecutionResult> {
    this.sequence += 1;
    return {
      id: `paper-${this.sequence}`,
      mode: "paper",
      symbol: intent.symbol,
      side: intent.side,
      quantity: intent.quantity,
      fillPrice: intent.price,
      notional: intent.quantity * intent.price,
      timestamp: Date.now(),
    };
  }
}
