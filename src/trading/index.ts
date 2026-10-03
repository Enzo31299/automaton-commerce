import type { ExecutionAdapter } from "./execution.js";
import { TradingRiskEngine } from "./risk-engine.js";
import type { ExecutionResult, PortfolioState, RiskDecision, TradeIntent } from "./types.js";

export interface TraderCycleResult {
  risk: RiskDecision;
  execution?: ExecutionResult;
}

export class AutomatonTrader {
  constructor(
    private readonly risk: TradingRiskEngine,
    private readonly execution: ExecutionAdapter,
  ) {}

  async process(intent: TradeIntent, portfolio: PortfolioState): Promise<TraderCycleResult> {
    const decision = this.risk.evaluate(intent, portfolio);
    if (!decision.allowed) return { risk: decision };

    const execution = await this.execution.execute(intent);
    return { risk: decision, execution };
  }
}

export * from "./types.js";
export * from "./risk-engine.js";
export * from "./execution.js";
