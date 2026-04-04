import { useState, useRef, useCallback, useEffect } from "react";
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
  position: number;
  stopWin: number;
  stopLoss: number;
  model: string;
}

interface PersistedBotState {
  running: boolean;
  config: BotConfig | null;
  symbolCode: string | null;
  trades: TradeEntry[];
  profitLoss: number;
  wins: number;
  losses: number;
  operations: number;
  martingaleLevel: number;
  lastDirection: "up" | "down" | null;
  directionCounter: number;
}

const STORAGE_KEY = "alpha_bot_state";

function loadState(): PersistedBotState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PersistedBotState;
    
    // Clean up stale "open" or "processing" trades that already expired
    // Only mark as loss visually — do NOT touch profitLoss since these were
    // orphaned by crashes, not real settled losses
    const now = Math.floor(Date.now() / 1000);
    state.trades = state.trades.map((t) => {
      if ((t.status === "open" || t.status === "processing") && t.expirationTimestamp && now >= t.expirationTimestamp + 30) {
        return { ...t, status: "loss" as const, result: t.result ?? 0 };
      }
      return t;
    });
    
    return state;
  } catch {
    return null;
  }
}

function saveState(state: PersistedBotState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export const useTradingBot = () => {
  const { brokerSession } = useAuth();

  // Load persisted state once
  const persisted = useRef(loadState());
  const p = persisted.current;

  const [isRunning, setIsRunning] = useState(p?.running ?? false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [trades, setTrades] = useState<TradeEntry[]>(p?.trades ?? []);
  const [profitLoss, setProfitLoss] = useState(p?.profitLoss ?? 0);
  const [wins, setWins] = useState(p?.wins ?? 0);
  const [losses, setLosses] = useState(p?.losses ?? 0);
  const [operations, setOperations] = useState(p?.operations ?? 0);
  const [balance, setBalance] = useState(0);
  const [status, setStatus] = useState(p?.running ? "Retomando..." : "Parado");
  const [currentMartingaleLevel, setCurrentMartingaleLevel] = useState(p?.martingaleLevel ?? 0);
  const [isMartingale, setIsMartingale] = useState((p?.martingaleLevel ?? 0) > 0);

  const botRef = useRef<{
    running: boolean;
    config: BotConfig | null;
    symbol: ApiSymbol | null;
    currentPrice: number;
    profitLoss: number;
    trades: TradeEntry[];
    wins: number;
    losses: number;
    operations: number;
  }>({
    running: p?.running ?? false,
    config: p?.config ?? null,
    symbol: null,
    currentPrice: 0,
    profitLoss: p?.profitLoss ?? 0,
    trades: p?.trades ?? [],
    wins: p?.wins ?? 0,
    losses: p?.losses ?? 0,
    operations: p?.operations ?? 0,
  });

  const directionCounter = useRef(p?.directionCounter ?? Math.floor(Math.random() * 2));
  const martingaleLevel = useRef(p?.martingaleLevel ?? 0);
  const lastDirection = useRef<"up" | "down" | null>(p?.lastDirection ?? null);
  const resumedRef = useRef(false);

  // Persist state on every meaningful change
  const persistNow = useCallback(() => {
    const state: PersistedBotState = {
      running: botRef.current.running,
      config: botRef.current.config,
      symbolCode: botRef.current.symbol?.code ?? null,
      trades: botRef.current.trades,
      profitLoss: botRef.current.profitLoss,
      wins: botRef.current.wins,
      losses: botRef.current.losses,
      operations: botRef.current.operations,
      martingaleLevel: martingaleLevel.current,
      lastDirection: lastDirection.current,
      directionCounter: directionCounter.current,
    };
    saveState(state);
  }, []);

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
    saveState({
      running: false,
      config: null,
      symbolCode: botRef.current.symbol?.code || null,
      trades: botRef.current.trades,
      profitLoss: botRef.current.profitLoss,
      wins: botRef.current.wins,
      losses: botRef.current.losses,
      operations: botRef.current.operations,
      martingaleLevel: 0,
      lastDirection: null,
      directionCounter: directionCounter.current,
    });
  }, []);

  const updateCurrentPrice = useCallback((price: number) => {
    botRef.current.currentPrice = price;
    const updated = botRef.current.trades.map((t) =>
      t.status === "open" ? { ...t, currentPrice: price } : t
    );
    botRef.current.trades = updated;
    setTrades(updated);
  }, []);

  const waitUntilTimestamp = useCallback((targetTimestamp: number): Promise<void> => {
    return new Promise((resolve) => {
      const now = Math.floor(Date.now() / 1000);
      if (now >= targetTimestamp || !botRef.current.running) {
        resolve();
        return;
      }
      const checkInterval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        if (now >= targetTimestamp || !botRef.current.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }, []);

  const waitForExpiration = useCallback(
    (expirationTimestamp: number): Promise<void> => {
      return waitUntilTimestamp(expirationTimestamp);
    },
    [waitUntilTimestamp]
  );

  const getNextCandleOpenTimestamp = useCallback((referenceTimestamp: number): number => {
    return referenceTimestamp % 60 === 0
      ? referenceTimestamp
      : Math.floor(referenceTimestamp / 60) * 60 + 60;
  }, []);

  const getRandomFirstEntryTimestamp = useCallback((): number => {
    const now = Math.floor(Date.now() / 1000);
    const nextCandleOpen = getNextCandleOpenTimestamp(now);
    const extraCandlesToSkip = Math.floor(Math.random() * 3);
    return nextCandleOpen + extraCandlesToSkip * 60;
  }, [getNextCandleOpenTimestamp]);

  const executeTradeCycle = useCallback(
    async (config: BotConfig, symbol: ApiSymbol, scheduledEntryTimestamp?: number) => {
      if (!botRef.current.running || !brokerSession) return;

      setIsProcessing(true);
      setStatus("Aguardando candle...");
      persistNow();

      try {
        const entryTimestamp =
          scheduledEntryTimestamp ?? getRandomFirstEntryTimestamp();

        await waitUntilTimestamp(entryTimestamp);
        if (!botRef.current.running) return;

        let direction: "up" | "down";
        let currentAmount = config.entryValue;
        const level = martingaleLevel.current;

        if (level > 0 && lastDirection.current) {
          direction = lastDirection.current;
          currentAmount = config.entryValue * Math.pow(2, level);
          setIsMartingale(true);
        } else {
          direction = getNextDirection();
          lastDirection.current = direction;
          setIsMartingale(false);
        }

        setStatus("Entrando...");

        const amountStr = currentAmount.toFixed(2).replace(".", ",");
        const directionNum = direction === "up" ? 1 : 0;

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

        botRef.current.trades = [trade, ...botRef.current.trades];
        botRef.current.operations += 1;
        setTrades(botRef.current.trades);
        setOperations(botRef.current.operations);
        setStatus("Ativo");

        const creditStr = result.user_credit;
        const creditCents = parseInt(
          creditStr.replace(/\./g, "").replace(",", "")
        );
        setBalance(creditCents / 100);
        alphaApi.updateSessionCredit(creditStr, creditCents);

        setIsProcessing(false);
        persistNow();

        await waitForExpiration(result.expiration_timestamp);
        // Don't abort here — we must settle the open trade even if bot was stopped

        const processingTrades = botRef.current.trades.map((t) =>
          t.id === result.transaction_id ? { ...t, status: "processing" as const } : t
        );
        botRef.current.trades = processingTrades;
        setTrades(processingTrades);
        persistNow();

        setIsProcessing(true);
        setStatus("Verificando...");

        let settlement: Awaited<ReturnType<typeof alphaApi.getSettlement>> | null = null;
        let txn: Awaited<ReturnType<typeof alphaApi.getTransaction>> | null = null;

        // Check immediately first — no delay
        settlement = await alphaApi.getSettlement();
        txn = await alphaApi.getTransaction(result.transaction_id);
        let settled = txn.transaction.status_id === 1 || txn.transaction.status_id === 2;

        if (!settled) {
          // Poll with short intervals if not ready yet
          for (let attempt = 0; attempt < 30; attempt += 1) {
            await new Promise((r) => setTimeout(r, attempt < 5 ? 80 : 150));
            settlement = await alphaApi.getSettlement();
            txn = await alphaApi.getTransaction(result.transaction_id);
            const statusId = txn.transaction.status_id;
            if (statusId === 1 || statusId === 2) { settled = true; break; }
          }
        }

        if (!botRef.current.running || !settlement || !txn) return;

        const balanceData = await alphaApi.getBalance();
        
        // Debug: log raw API responses to understand win/loss mapping
        console.log("[Bot] Settlement:", JSON.stringify({ result_type: settlement.result_type, amount_result_cents: settlement.amount_result_cents }));
        console.log("[Bot] Transaction:", JSON.stringify({ status_id: txn.transaction.status_id, status: txn.transaction.status, returns_cents: txn.transaction.returns_cents, amount_cents: txn.transaction.amount_cents }));

        // Use returns_cents as source of truth: positive = win, zero/negative = loss
        const returnsCents = txn.transaction.returns_cents;
        const isWin = returnsCents > 0;
        const resultAmount = returnsCents / 100;

        console.log("[Bot] isWin:", isWin, "returnsCents:", returnsCents, "resultAmount:", resultAmount);

        const updatedTrades = botRef.current.trades.map((t) =>
          t.id === result.transaction_id
            ? {
                ...t,
                status: isWin ? ("win" as const) : ("loss" as const),
                result: isWin ? resultAmount : -trade.amount,
              }
            : t
        );
        botRef.current.trades = updatedTrades;
        setTrades(updatedTrades);

        let newPL = botRef.current.profitLoss;
        if (isWin) {
          botRef.current.wins += 1;
          setWins(botRef.current.wins);
          newPL += resultAmount;
        } else {
          botRef.current.losses += 1;
          setLosses(botRef.current.losses);
          newPL -= trade.amount;
        }
        setProfitLoss(newPL);
        botRef.current.profitLoss = newPL;

        setBalance(balanceData.credit_cents / 100);
        alphaApi.updateSessionCredit(
          balanceData.credit,
          balanceData.credit_cents
        );

        setIsProcessing(false);
        persistNow();

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

        if (isWin) {
          martingaleLevel.current = 0;
          setCurrentMartingaleLevel(0);
          setIsMartingale(false);
          lastDirection.current = null;
        } else {
          const currentLevel = martingaleLevel.current;
          if (currentLevel < config.position) {
            martingaleLevel.current = currentLevel + 1;
            setCurrentMartingaleLevel(currentLevel + 1);
            setIsMartingale(true);
          } else {
            martingaleLevel.current = 0;
            setCurrentMartingaleLevel(0);
            setIsMartingale(false);
            lastDirection.current = null;
          }
        }

        if (botRef.current.running) {
          const nextEntryTimestamp = getNextCandleOpenTimestamp(
            result.expiration_timestamp
          );
          persistNow();
          void executeTradeCycle(config, symbol, nextEntryTimestamp);
        }
      } catch (error) {
        console.error("Trade cycle error:", error);
        setIsProcessing(false);
        if (botRef.current.running) {
          setStatus("Aguardando candle...");
          const retryTimestamp = getNextCandleOpenTimestamp(
            Math.floor(Date.now() / 1000) + 1
          );
          void executeTradeCycle(config, symbol, retryTimestamp);
        }
      }
    },
    [
      brokerSession,
      getNextDirection,
      getNextCandleOpenTimestamp,
      getRandomFirstEntryTimestamp,
      waitForExpiration,
      waitUntilTimestamp,
      stopBot,
      persistNow,
    ]
  );

  // Resume bot after refresh when symbols are loaded
  const resumeBot = useCallback(
    (symbols: ApiSymbol[]) => {
      if (resumedRef.current) return;
      const saved = persisted.current;
      if (!saved?.running || !saved.config || !saved.symbolCode || !brokerSession) return;
      resumedRef.current = true;

      const sym = symbols.find((s) => s.code === saved.symbolCode);
      if (!sym) return;

      botRef.current.symbol = sym;
      botRef.current.config = saved.config;
      botRef.current.running = true;

      setIsRunning(true);
      setBalance(brokerSession.creditCents / 100);

      // Check if there's an open trade that hasn't expired yet
      const openTrade = saved.trades.find((t) => t.status === "open");
      if (openTrade) {
        const now = Math.floor(Date.now() / 1000);
        if (now < openTrade.expirationTimestamp) {
          // Still active — wait for expiration then continue
          setStatus("Ativo");
          // We can't fully resume mid-trade settlement easily,
          // so we wait for next candle after expiration
          const nextEntry = getNextCandleOpenTimestamp(openTrade.expirationTimestamp);
          void executeTradeCycle(saved.config, sym, nextEntry);
          return;
        }
      }

      // No open trade or already expired — schedule next candle
      const nextEntry = getNextCandleOpenTimestamp(Math.floor(Date.now() / 1000));
      void executeTradeCycle(saved.config, sym, nextEntry);
    },
    [brokerSession, executeTradeCycle, getNextCandleOpenTimestamp]
  );

  const startBot = useCallback(
    (config: BotConfig, symbol: ApiSymbol) => {
      if (!brokerSession) return;

      botRef.current.running = true;
      botRef.current.config = config;
      botRef.current.symbol = symbol;
      botRef.current.profitLoss = 0;
      botRef.current.trades = [];
      botRef.current.wins = 0;
      botRef.current.losses = 0;
      botRef.current.operations = 0;

      martingaleLevel.current = 0;
      lastDirection.current = null;
      directionCounter.current = Math.floor(Math.random() * 2);

      setIsRunning(true);
      setStatus("Aguardando candle...");
      setBalance(brokerSession.creditCents / 100);
      setProfitLoss(0);
      setWins(0);
      setLosses(0);
      setOperations(0);
      setTrades([]);
      setCurrentMartingaleLevel(0);
      setIsMartingale(false);

      const firstEntryTimestamp = getRandomFirstEntryTimestamp();
      persistNow();
      void executeTradeCycle(config, symbol, firstEntryTimestamp);
    },
    [brokerSession, executeTradeCycle, getRandomFirstEntryTimestamp, persistNow]
  );

  const winRate = operations > 0 ? (wins / operations) * 100 : 0;

  const clearHistory = useCallback(() => {
    botRef.current.trades = [];
    botRef.current.profitLoss = 0;
    botRef.current.wins = 0;
    botRef.current.losses = 0;
    botRef.current.operations = 0;
    setTrades([]);
    setProfitLoss(0);
    setWins(0);
    setLosses(0);
    setOperations(0);
    persistNow();
  }, [persistNow]);

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
    resumeBot,
    clearHistory,
  };
};
