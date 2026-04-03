import { useState, useRef, useCallback } from "react";
import { alphaApi, type OpenPositionResponse, type Symbol as ApiSymbol } from "@/lib/api";
import { useAuth } from "./useAuth";

export interface TradeEntry {
  id: number;
  symbol: string;
  symbolImg: string;
  direction: "up" | "down";
  entryPrice: number;
  currentPrice: number;
  amount: number;
  amountFormatted: string;
  expirationTimestamp: number;
  expirationSeconds: number;
  status: "open" | "win" | "loss" | "processing";
  result?: number; // profit/loss amount
}

interface BotConfig {
  entryValue: number;
  position: number;
  stopWin: number;
  stopLoss: number;
  model: string;
}

export const useTradingBot = () => {
  const { brokerSession } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [profitLoss, setProfitLoss] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [operations, setOperations] = useState(0);
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState("Parado");

  const botRef = useRef<{
    running: boolean;
    config: BotConfig | null;
    symbol: ApiSymbol | null;
    currentPrice: number;
  }>({
    running: false,
    config: null,
    symbol: null,
    currentPrice: 0,
  });

  const stopBot = useCallback(() => {
    botRef.current.running = false;
    setIsRunning(false);
    setIsProcessing(false);
    setStatus("Parado");
  }, []);

  const updateCurrentPrice = useCallback((price: number) => {
    botRef.current.currentPrice = price;
    // Update open trades' current price
    setTrades((prev) =>
      prev.map((t) =>
        t.status === "open" ? { ...t, currentPrice: price } : t
      )
    );
  }, []);

  const analyzeMarket = useCallback(
    async (symbol: string, model: string): Promise<number> => {
      // Fetch latest candles for analysis
      const candles = await alphaApi.getHistoricalData(symbol);
      if (candles.length < 5) return Math.random() > 0.5 ? 1 : 0;

      const recent = candles.slice(-5);
      const closes = recent.map((c) => parseFloat(c.close));

      // Simple trend analysis
      const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
      const lastClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];

      // Momentum
      const momentum = lastClose - prevClose;
      const trendStrength = (lastClose - avg) / avg;

      // Based on model, adjust strategy
      let direction: number;
      if (model === "grok") {
        // Trend following
        direction = momentum > 0 ? 1 : 0;
      } else if (model === "claude") {
        // Mean reversion
        direction = trendStrength > 0 ? 0 : 1;
      } else {
        // GPT - mixed strategy
        direction = trendStrength > 0.001 ? 0 : momentum > 0 ? 1 : 0;
      }

      return direction;
    },
    []
  );

  const waitForExpiration = useCallback(
    (expirationTimestamp: number): Promise<void> => {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const now = Math.floor(Date.now() / 1000);
          if (now >= expirationTimestamp || !botRef.current.running) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });
    },
    []
  );

  const executeTradeCycle = useCallback(
    async (config: BotConfig, symbol: ApiSymbol) => {
      if (!botRef.current.running || !brokerSession) return;

      setIsProcessing(true);
      setStatus("Ativo");

      try {
        // Analyze market
        const direction = await analyzeMarket(symbol.code, config.model);

        if (!botRef.current.running) return;

        // Format amount like the reference site: "766,00"
        const amountStr = config.entryValue
          .toFixed(2)
          .replace(".", ",");

        // Open position
        const result: OpenPositionResponse = await alphaApi.openPosition({
          symbol: symbol.code,
          direction,
          amount: amountStr,
          price: botRef.current.currentPrice,
        });

        if (!botRef.current.running) return;

        // Add trade to history
        const trade: TradeEntry = {
          id: result.transaction_id,
          symbol: result.symbol,
          symbolImg: result.symbol_img,
          direction: result.direction as "up" | "down",
          entryPrice: Number(result.symbol_price),
          currentPrice: Number(botRef.current.currentPrice),
          amount: result.amount_cents / 100,
          amountFormatted: result.amount,
          expirationTimestamp: result.expiration_timestamp,
          expirationSeconds: result.expiration_seconds,
          status: "open",
        };

        setTrades((prev) => [trade, ...prev]);
        setOperations((prev) => prev + 1);

        // Update balance after opening position
        const creditStr = result.user_credit;
        const creditCents = parseInt(
          creditStr.replace(/\./g, "").replace(",", "")
        );
        setBalance(creditCents / 100);
        alphaApi.updateSessionCredit(creditStr, creditCents);

        setIsProcessing(false);

        // Wait for expiration
        await waitForExpiration(result.expiration_timestamp);

        if (!botRef.current.running) return;

        // Check settlement
        setIsProcessing(true);

        // Wait a moment for settlement to process
        await new Promise((r) => setTimeout(r, 2000));

        const settlement = await alphaApi.getSettlement();
        const txn = await alphaApi.getTransaction(result.transaction_id);
        const balanceData = await alphaApi.getBalance();

        // Update trade result
        const isWin = settlement.result_type === 2 || txn.transaction.status_id === 2;
        const resultAmount = settlement.amount_result_cents / 100;

        setTrades((prev) =>
          prev.map((t) =>
            t.id === result.transaction_id
              ? {
                  ...t,
                  status: isWin ? ("win" as const) : ("loss" as const),
                  result: isWin ? resultAmount : -(trade.amount),
                }
              : t
          )
        );

        if (isWin) {
          setWins((prev) => prev + 1);
          setProfitLoss((prev) => prev + resultAmount);
        } else {
          setLosses((prev) => prev + 1);
          setProfitLoss((prev) => prev - trade.amount);
        }

        // Update balance
        setBalance(balanceData.credit_cents / 100);
        alphaApi.updateSessionCredit(
          balanceData.credit,
          balanceData.credit_cents
        );

        setIsProcessing(false);

        // Check stop win / stop loss
        const currentPL = isWin
          ? profitLoss + resultAmount
          : profitLoss - trade.amount;

        if (currentPL >= config.stopWin) {
          stopBot();
          return;
        }
        if (currentPL <= -config.stopLoss) {
          stopBot();
          return;
        }

        // Continue trading cycle
        if (botRef.current.running) {
          // Small delay before next trade
          await new Promise((r) => setTimeout(r, 3000));
          executeTradeCycle(config, symbol);
        }
      } catch (error) {
        console.error("Trade cycle error:", error);
        setIsProcessing(false);
        // Retry after delay if still running
        if (botRef.current.running) {
          await new Promise((r) => setTimeout(r, 5000));
          executeTradeCycle(config, symbol);
        }
      }
    },
    [brokerSession, analyzeMarket, waitForExpiration, stopBot, profitLoss]
  );

  const startBot = useCallback(
    (config: BotConfig, symbol: ApiSymbol) => {
      if (!brokerSession) return;

      botRef.current.running = true;
      botRef.current.config = config;
      botRef.current.symbol = symbol;

      setIsRunning(true);
      setStatus("Ativo");
      setBalance(brokerSession?.creditCents / 100);

      executeTradeCycle(config, symbol);
    },
    [brokerSession, executeTradeCycle]
  );

  const winRate =
    operations > 0 ? (wins / operations) * 100 : 0;

  return {
    isRunning,
    isProcessing,
    trades,
    profitLoss,
    wins,
    losses,
    operations,
    winRate,
    balance,
    status,
    startBot,
    stopBot,
    updateCurrentPrice,
  };
};
