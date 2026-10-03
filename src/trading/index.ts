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

export * from "./strategy.js";
export * from "./backtest.js";
export * from "./walk-forward.js";
export * from "./market-data.js";
export * from "./research.js";
export * from "./historical-data.js";
export * from "./coinbase-market-data.js";
export * from "./public-crypto-research.js";
export * from "./momentum-strategy.js";
export * from "./strategy-comparison.js";
export * from "./research-report.js";
export * from "./paper-trading-gate.js";
export * from "./paper-session.js";
export * from "./paper-loop.js";
export * from "./trading-journal.js";
export * from "./sqlite-journal.js";
export * from "./trader-heartbeat.js";
export * from "./trading-memory.js";
