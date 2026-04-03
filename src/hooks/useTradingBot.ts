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
  result?: number;
  martingaleLevel?: number;
}

interface BotConfig {
  entryValue: number;
  position: number; // martingale iterations
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
  const [currentMartingaleLevel, setCurrentMartingaleLevel] = useState(0);
  const [isMartingale, setIsMartingale] = useState(false);

  const botRef = useRef<{
    running: boolean;
    config: BotConfig | null;
    symbol: ApiSymbol | null;
    currentPrice: number;
    profitLoss: number;
  }>({
    running: false,
    config: null,
    symbol: null,
    currentPrice: 0,
    profitLoss: 0,
  });

  // Alternating direction counter (same as base site)
  const directionCounter = useRef(Math.floor(Math.random() * 2));
  const martingaleLevel = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  const getNextDirection = useCallback((): "up" | "down" => {
    directionCounter.current += 1;
    return directionCounter.current % 2 === 0 ? "up" : "down";
  }, []);

  const stopBot = useCallback(() => {
    botRef.current.running = false;
    setIsRunning(false);
    setIsProcessing(false);
    setStatus("Parado");
    martingaleLevel.current = 0;
    setCurrentMartingaleLevel(0);
    setIsMartingale(false);
    lastDirection.current = null;
  }, []);

  const updateCurrentPrice = useCallback((price: number) => {
    botRef.current.currentPrice = price;
    setTrades((prev) =>
      prev.map((t) =>
        t.status === "open" ? { ...t, currentPrice: price } : t
      )
    );
  }, []);

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

  // Wait until the next candle opens (second 00 of the next minute)
  const waitForCandleOpen = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!botRef.current.running) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        const now = new Date();
        const seconds = now.getSeconds();
        // Enter at second 0 (candle open, timer shows ~0:59)
        if (seconds === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 200);
    });
  }, []);

  const executeTradeCycle = useCallback(
    async (config: BotConfig, symbol: ApiSymbol) => {
      if (!botRef.current.running || !brokerSession) return;

      setIsProcessing(true);
      setStatus("Analisando...");

      try {
        // Wait for candle open (second 00 of next minute)
        setStatus("Aguardando candle...");
        await waitForCandleOpen();

        if (!botRef.current.running) return;

        // Determine direction
        let direction: "up" | "down";
        let currentAmount = config.entryValue;
        const level = martingaleLevel.current;

        if (level > 0 && lastDirection.current) {
          // Martingale: keep same direction, increase amount
          direction = lastDirection.current;
          currentAmount = config.entryValue * Math.pow(2, level);
          setIsMartingale(true);
        } else {
          // Normal: get next alternating direction
          direction = getNextDirection();
          lastDirection.current = direction;
          setIsMartingale(false);
        }

        setStatus("Entrando...");

        // Format amount: "766,00"
        const amountStr = currentAmount.toFixed(2).replace(".", ",");
        const directionNum = direction === "up" ? 1 : 0;

        // Open real position
        const result: OpenPositionResponse = await alphaApi.openPosition({
          symbol: symbol.code,
          direction: directionNum,
          amount: amountStr,
          price: botRef.current.currentPrice,
        });

        if (!botRef.current.running) return;

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
          martingaleLevel: level,
        };

        setTrades((prev) => [trade, ...prev]);
        setOperations((prev) => prev + 1);
        setStatus("Ativo");

        // Update balance
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

        setIsProcessing(true);
        setStatus("Verificando...");

        // Wait for settlement
        await new Promise((r) => setTimeout(r, 2000));

        const settlement = await alphaApi.getSettlement();
        const txn = await alphaApi.getTransaction(result.transaction_id);
        const balanceData = await alphaApi.getBalance();

        const isWin =
          settlement.result_type === 2 || txn.transaction.status_id === 2;
        const resultAmount = settlement.amount_result_cents / 100;

        // Update trade result
        setTrades((prev) =>
          prev.map((t) =>
            t.id === result.transaction_id
              ? {
                  ...t,
                  status: isWin ? ("win" as const) : ("loss" as const),
                  result: isWin ? resultAmount : -trade.amount,
                }
              : t
          )
        );

        // Update stats
        let newPL = botRef.current.profitLoss;
        if (isWin) {
          setWins((prev) => prev + 1);
          newPL += resultAmount;
        } else {
          setLosses((prev) => prev + 1);
          newPL -= trade.amount;
        }
        setProfitLoss(newPL);
        botRef.current.profitLoss = newPL;

        // Update balance
        setBalance(balanceData.credit_cents / 100);
        alphaApi.updateSessionCredit(
          balanceData.credit,
          balanceData.credit_cents
        );

        setIsProcessing(false);

        // Check stop win / stop loss
        if (newPL <= -config.stopLoss) {
          setStatus("Stop Loss");
          stopBot();
          return;
        }
        if (newPL >= config.stopWin) {
          setStatus("Stop Win");
          stopBot();
          return;
        }

        // Martingale logic (same as base site)
        if (isWin) {
          // Win: reset martingale, get new direction
          martingaleLevel.current = 0;
          setCurrentMartingaleLevel(0);
          setIsMartingale(false);
          lastDirection.current = null;
        } else {
          // Loss: check if we can increase martingale
          const currentLevel = martingaleLevel.current;
          if (currentLevel < config.position) {
            // Increase martingale level, keep same direction
            martingaleLevel.current = currentLevel + 1;
            setCurrentMartingaleLevel(currentLevel + 1);
            setIsMartingale(true);
          } else {
            // Max martingale reached: reset, get new direction
            martingaleLevel.current = 0;
            setCurrentMartingaleLevel(0);
            setIsMartingale(false);
            lastDirection.current = null;
          }
        }

        // Continue trading cycle
        if (botRef.current.running) {
          executeTradeCycle(config, symbol);
        }
      } catch (error) {
        console.error("Trade cycle error:", error);
        setIsProcessing(false);
        // Retry after delay if still running
        if (botRef.current.running) {
          setStatus("Aguardando...");
          await new Promise((r) => setTimeout(r, 5000));
          if (botRef.current.running) {
            executeTradeCycle(config, symbol);
          }
        }
      }
    },
    [
      brokerSession,
      getNextDirection,
      waitForExpiration,
      waitForCandleOpen,
      stopBot,
    ]
  );

  const startBot = useCallback(
    (config: BotConfig, symbol: ApiSymbol) => {
      if (!brokerSession) return;

      botRef.current.running = true;
      botRef.current.config = config;
      botRef.current.symbol = symbol;
      botRef.current.profitLoss = 0;

      martingaleLevel.current = 0;
      lastDirection.current = null;
      directionCounter.current = Math.floor(Math.random() * 2);

      setIsRunning(true);
      setStatus("Ativo");
      setBalance(brokerSession.creditCents / 100);
      setProfitLoss(0);
      setWins(0);
      setLosses(0);
      setOperations(0);
      setCurrentMartingaleLevel(0);
      setIsMartingale(false);

      executeTradeCycle(config, symbol);
    },
    [brokerSession, executeTradeCycle]
  );

  const winRate = operations > 0 ? (wins / operations) * 100 : 0;

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
    currentMartingaleLevel,
    isMartingale,
  };
};
