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
const CANDLE_SECONDS = 60;
const ENTRY_GRACE_SECONDS = 1;

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const getCurrentOrNextCandleOpen = (referenceTimestamp: number) => {
  const normalized = Math.floor(referenceTimestamp);
  return normalized % CANDLE_SECONDS === 0
    ? normalized
    : Math.floor(normalized / CANDLE_SECONDS) * CANDLE_SECONDS + CANDLE_SECONDS;
};

const getStrictNextCandleOpen = (referenceTimestamp: number) => {
  const normalized = Math.floor(referenceTimestamp);
  return Math.floor(normalized / CANDLE_SECONDS) * CANDLE_SECONDS + CANDLE_SECONDS;
};

const getFollowUpEntryTimestamp = (expirationTimestamp: number) => {
  const now = nowInSeconds();
  return now <= expirationTimestamp + ENTRY_GRACE_SECONDS
    ? expirationTimestamp
    : getStrictNextCandleOpen(now);
};

const getTradeOutcomeFromPrice = (
  trade: TradeEntry,
  closePrice: number,
  odd: number
) => {
  const normalizedOdd = Number.isFinite(odd) ? odd : 0;
  const isWin = trade.direction === "up"
    ? closePrice > trade.entryPrice
    : closePrice < trade.entryPrice;
  // odd comes as a multiplier (e.g. 1.80 = 80% profit) or as percentage (e.g. 80)
  const profitAmount = Number(
    (normalizedOdd > 10
      ? (trade.amount * normalizedOdd) / 100   // percentage: 80 → 80%
      : trade.amount * (normalizedOdd - 1)      // multiplier: 1.80 → 80%
    ).toFixed(2)
  );

  return {
    isWin,
    resultAmount: isWin ? profitAmount : -trade.amount,
  };
};

function loadState(): PersistedBotState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PersistedBotState;
    
    // Clean up stale "open" or "processing" trades that already expired
    // Only mark as loss visually — do NOT touch profitLoss since these were
    // orphaned by crashes, not real settled losses
    const now = nowInSeconds();
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

  const waitUntilTimestamp = useCallback((targetTimestamp: number, respectRunning = true): Promise<void> => {
    return new Promise((resolve) => {
      const now = nowInSeconds();
      if (now >= targetTimestamp || (respectRunning && !botRef.current.running)) {
        resolve();
        return;
      }
      const checkInterval = setInterval(() => {
        const now = nowInSeconds();
        if (now >= targetTimestamp || (respectRunning && !botRef.current.running)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }, []);

  const waitForExpiration = useCallback(
    (expirationTimestamp: number): Promise<void> => {
      // Always wait for the full expiration — never abort early even if bot is stopped
      return waitUntilTimestamp(expirationTimestamp, false);
    },
    [waitUntilTimestamp]
  );

  const getNextCandleOpenTimestamp = useCallback((referenceTimestamp: number): number => {
    return getCurrentOrNextCandleOpen(referenceTimestamp);
  }, []);

  const getStrictNextCandleOpenTimestamp = useCallback((referenceTimestamp: number): number => {
    return getStrictNextCandleOpen(referenceTimestamp);
  }, []);

  const getFirstEntryTimestamp = useCallback((): number => {
    const now = nowInSeconds();
    return getNextCandleOpenTimestamp(now);
  }, [getNextCandleOpenTimestamp]);

  const executeTradeCycle = useCallback(
    async (config: BotConfig, symbol: ApiSymbol, scheduledEntryTimestamp?: number) => {
      if (!botRef.current.running || !brokerSession) return;

      setIsProcessing(true);
      setStatus("Aguardando candle...");
      persistNow();

      try {
        const entryTimestamp = scheduledEntryTimestamp ?? getFirstEntryTimestamp();

        await waitUntilTimestamp(entryTimestamp);
        if (!botRef.current.running) return;

        const entryDelaySeconds = nowInSeconds() - entryTimestamp;
        if (entryDelaySeconds > ENTRY_GRACE_SECONDS) {
          const retryTimestamp = getStrictNextCandleOpenTimestamp(nowInSeconds());
          setIsProcessing(false);
          setStatus("Aguardando próxima candle...");
          persistNow();
          if (botRef.current.running) {
            void executeTradeCycle(config, symbol, retryTimestamp);
          }
          return;
        }

        const level = martingaleLevel.current;
        const isMartingaleEntry = level > 0 && lastDirection.current;
        const direction: "up" | "down" = isMartingaleEntry
          ? lastDirection.current!
          : getNextDirection();
        const currentAmount = isMartingaleEntry
          ? config.entryValue * Math.pow(2, level)
          : config.entryValue;

        lastDirection.current = direction;
        setIsMartingale(level > 0);
        setStatus("Entrando...");

        const amountStr = currentAmount.toFixed(2).replace(".", ",");
        const directionNum = direction === "up" ? 1 : 0;

        const result: OpenPositionResponse = await alphaApi.openPosition({
          symbol: symbol.code,
          direction: directionNum,
          amount: amountStr,
          price: botRef.current.currentPrice,
        });

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

        const closePrice = botRef.current.currentPrice > 0
          ? botRef.current.currentPrice
          : trade.currentPrice > 0
            ? trade.currentPrice
            : trade.entryPrice;
        const { isWin, resultAmount } = getTradeOutcomeFromPrice(
          trade,
          closePrice,
          result.odd
        );

        const updatedTrades = botRef.current.trades.map((t) =>
          t.id === result.transaction_id
            ? {
                ...t,
                currentPrice: closePrice,
                status: isWin ? ("win" as const) : ("loss" as const),
                result: resultAmount,
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
          martingaleLevel.current = 0;
          setCurrentMartingaleLevel(0);
          setIsMartingale(false);
          lastDirection.current = null;
        } else {
          botRef.current.losses += 1;
          setLosses(botRef.current.losses);
          newPL += resultAmount;

          if (martingaleLevel.current < config.position) {
            martingaleLevel.current += 1;
            setCurrentMartingaleLevel(martingaleLevel.current);
            setIsMartingale(true);
          } else {
            martingaleLevel.current = 0;
            setCurrentMartingaleLevel(0);
            setIsMartingale(false);
            lastDirection.current = null;
          }
        }

        setProfitLoss(newPL);
        botRef.current.profitLoss = newPL;

        setIsProcessing(false);
        if (botRef.current.running) {
          setStatus("Aguardando candle...");
        }
        persistNow();

        void alphaApi.getBalance().then((balanceData) => {
          setBalance(balanceData.credit_cents / 100);
          alphaApi.updateSessionCredit(
            balanceData.credit,
            balanceData.credit_cents
          );
        }).catch(() => {});

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

        if (botRef.current.running) {
          const nextEntryTimestamp = getFollowUpEntryTimestamp(result.expiration_timestamp);
          persistNow();
          void executeTradeCycle(config, symbol, nextEntryTimestamp);
        }
      } catch (error) {
        console.error("Trade cycle error:", error);
        setIsProcessing(false);
        if (botRef.current.running) {
          setStatus("Aguardando candle...");
          const retryTimestamp = getStrictNextCandleOpenTimestamp(nowInSeconds());
          void executeTradeCycle(config, symbol, retryTimestamp);
        }
      }
    },
    [
      brokerSession,
      getFirstEntryTimestamp,
      getNextCandleOpenTimestamp,
      getNextDirection,
      persistNow,
      stopBot,
      waitForExpiration,
      waitUntilTimestamp,
    ]
  );

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

      const pendingTrade = saved.trades.find(
        (t) => t.status === "open" || t.status === "processing"
      );

      if (pendingTrade) {
        const now = nowInSeconds();
        if (now < pendingTrade.expirationTimestamp) {
          setStatus("Ativo");
          const nextEntry = getStrictNextCandleOpenTimestamp(pendingTrade.expirationTimestamp);
          void executeTradeCycle(saved.config, sym, nextEntry);
          return;
        }
      }

      const nextEntry = getStrictNextCandleOpenTimestamp(nowInSeconds());
      void executeTradeCycle(saved.config, sym, nextEntry);
    },
    [brokerSession, executeTradeCycle, getStrictNextCandleOpenTimestamp]
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

      const firstEntryTimestamp = getFirstEntryTimestamp();
      persistNow();
      void executeTradeCycle(config, symbol, firstEntryTimestamp);
    },
    [brokerSession, executeTradeCycle, getFirstEntryTimestamp, persistNow]
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
