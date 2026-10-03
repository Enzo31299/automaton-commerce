import { runCryptoResearch } from "../src/trading/crypto-research-runner.js";

const DAY = 86400;
const end = Math.floor(Date.now() / 1000 / DAY) * DAY;
const start = end - 5 * 365 * DAY;

const results = await runCryptoResearch({
  symbols: ["BTC-USD", "ETH-USD"],
  timeframe: "1d",
  start,
  end,
  trainSize: 365,
  testSize: 90,
  backtest: {
    initialCapital: 150,
    feeRate: 0.006,
    allocationFraction: 0.25,
  },
  gate: {
    minWindows: 8,
    minProfitableWindowRatio: 0.5,
    maxDrawdownPct: 15,
    minAverageTestReturnPct: 0,
  },
});

console.log(JSON.stringify({ start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString(), results }, null, 2));
