import type { MarketRequest } from "./market-data.js";
import type { PaperTradingLoop, PaperLoopResult } from "./paper-loop.js";
import type { TradingJournal } from "./trading-journal.js";

export interface TraderHeartbeatResult {
  shouldWake: boolean;
  message?: string;
  result: PaperLoopResult;
}

export async function runTraderHeartbeat(
  loop: PaperTradingLoop,
  journal: TradingJournal,
  request: MarketRequest,
  strategyName: string,
  now = Date.now(),
): Promise<TraderHeartbeatResult> {
  const result = await loop.tick(request);
  await journal.append({
    timestamp: now,
    type: "signal",
    symbol: request.symbol,
    strategy: strategyName,
    details: {
      signal: result.signal,
      submitted: result.submitted,
      blocked: result.blocked,
      ...(result.price === undefined ? {} : { price: result.price }),
    },
  });

  if (result.blocked) {
    await journal.append({
      timestamp: now,
      type: "risk_block",
      symbol: request.symbol,
      strategy: strategyName,
      details: { signal: result.signal },
    });
  } else if (result.submitted) {
    await journal.append({
      timestamp: now,
      type: "paper_fill",
      symbol: request.symbol,
      strategy: strategyName,
      details: { signal: result.signal, price: result.price ?? 0 },
    });
  }

  return {
    shouldWake: result.blocked,
    ...(result.blocked ? { message: `Trader risk block: ${request.symbol} ${result.signal}` } : {}),
    result,
  };
}
