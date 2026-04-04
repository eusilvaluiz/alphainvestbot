import { useEffect, useRef, useState, useMemo } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";
import { ChevronDown, Search, X } from "lucide-react";
import { alphaApi, type Symbol as ApiSymbol, type CandleData } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import type { TradeEntry } from "@/hooks/useTradingBot";
import { useAuth } from "@/hooks/useAuth";
import * as Ably from "ably";

interface CandlestickChartProps {
  selectedSymbol: ApiSymbol | null;
  symbols: ApiSymbol[];
  onSymbolChange: (symbol: ApiSymbol) => void;
  onPriceUpdate?: (price: number) => void;
  activeTrades?: TradeEntry[];
}

interface UdfData {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v?: number[];
}

type ChartCandle = {
  time: any;
  open: number;
  high: number;
  low: number;
  close: number;
};

// Client-side session cookie cache
let cachedSessionCookies: string | null = null;

async function fetchUnicCandles(symbol: string, countback = 300) {
  try {
    const stored = localStorage.getItem("broker_credentials");
    if (!stored) return null;
    const { user, pass } = JSON.parse(stored);
    if (!user || !pass) return null;

    const body: Record<string, unknown> = {
      symbol,
      resolution: "1",
      countback,
      broker_user: user,
      broker_pass: pass,
    };

    // Send cached cookies so edge function can skip login
    if (cachedSessionCookies) {
      body.session_cookies = cachedSessionCookies;
    }

    const { data, error } = await supabase.functions.invoke("unic-chart", {
      body,
    });

    if (error || !data || data.s !== "ok" || !data.t?.length) {
      // If failed, clear cached cookies so next call forces fresh login
      cachedSessionCookies = null;
      return null;
    }

    // Cache the session cookies returned by edge function
    if (data.session_cookies) {
      cachedSessionCookies = data.session_cookies;
    }

    const udf = data as UdfData;
    return udf.t.map((t, i) => ({
      time: t,
      open: udf.o[i],
      high: udf.h[i],
      low: udf.l[i],
      close: udf.c[i],
    }));
  } catch {
    return null;
  }
}

async function fetchAblyToken(): Promise<Ably.TokenDetails | null> {
  try {
    const stored = localStorage.getItem("broker_credentials");
    if (!stored) return null;
    const { user, pass } = JSON.parse(stored);
    if (!user || !pass) return null;

    const { data, error } = await supabase.functions.invoke("unic-ws-auth", {
      body: { broker_user: user, broker_pass: pass },
    });

    if (error || !data?.token) return null;
    return data as Ably.TokenDetails;
  } catch {
    return null;
  }
}

const BRAND_URL = "unicbroker.com";
const HISTORICAL_SYNC_INTERVAL_MS = 5000;
const REALTIME_SYNC_DEBOUNCE_MS = 700;

const parseNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseJsonSafely = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toUnixSeconds = (value: number) => (value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value));

const parseRealtimeTick = (input: unknown): { closePrice: number; timestamp: number } | null => {
  const parsed = parseJsonSafely(input);

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const closePrice = parseNumber(record.close ?? record.c ?? record.price ?? record.last_price ?? record.value);
  const timestamp = parseNumber(record.time ?? record.t ?? record.timestamp ?? record.ts ?? record.updated_at);

  if (closePrice !== null && timestamp !== null) {
    return { closePrice, timestamp: toUnixSeconds(timestamp) };
  }

  for (const key of ["data", "payload", "tick", "message"]) {
    if (record[key] !== undefined) {
      const nested = parseRealtimeTick(record[key]);
      if (nested) return nested;
    }
  }

  return null;
};

/* ── Category mapping ── */
const CATEGORY_TABS = [
  { key: "all", label: "Todos" },
  { key: "crypto", label: "Crypto" },
  { key: "forex", label: "Forex" },
  { key: "stock", label: "Ações" },
  { key: "commodity", label: "Commodities" },
] as const;

type CategoryKey = (typeof CATEGORY_TABS)[number]["key"];

function guessCategory(s: ApiSymbol): CategoryKey {
  const code = s.code.toUpperCase();
  const name = s.name.toLowerCase();
  // Crypto: ends with USDT or known crypto names
  if (code.endsWith("USDT") || code.endsWith("BTC") || /bitcoin|ethereum|litecoin|ripple|cardano|solana|doge|bnb|tron|polkadot|avalanche|chainlink|polygon|shiba|uniswap|stellar/i.test(name)) return "crypto";
  // Forex: typical currency pairs
  if (/^(EUR|USD|GBP|JPY|AUD|NZD|CAD|CHF)(EUR|USD|GBP|JPY|AUD|NZD|CAD|CHF)$/i.test(code) || /forex|currency/i.test(s.type)) return "forex";
  // Commodities
  if (/gold|silver|oil|brent|crude|gas|platinum|palladium|copper|wheat|corn|coffee|sugar|cocoa|cotton|xau|xag|wti/i.test(name) || /xau|xag|wti|brent/i.test(code)) return "commodity";
  // Stocks
  if (/stock|share|equity|ação/i.test(s.type) || /apple|tesla|google|amazon|meta|microsoft|nvidia|netflix|ibm|disney|coca|nike|visa|mastercard|paypal|uber|airbnb|snap|twitter|intel|amd|qualcomm/i.test(name)) return "stock";
  // Fallback based on type field
  if (s.type) {
    const t = s.type.toLowerCase();
    if (t.includes("crypto") || t.includes("digital")) return "crypto";
    if (t.includes("forex") || t.includes("currency")) return "forex";
    if (t.includes("stock") || t.includes("equit")) return "stock";
    if (t.includes("commod")) return "commodity";
  }
  return "crypto"; // default
}

/* ── Symbol Picker Modal ── */
const SymbolPickerModal = ({
  symbols,
  selectedSymbol,
  onSelect,
  onClose,
}: {
  symbols: ApiSymbol[];
  selectedSymbol: ApiSymbol | null;
  onSelect: (s: ApiSymbol) => void;
  onClose: () => void;
}) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    let list = symbols;
    if (activeCategory !== "all") {
      list = list.filter((s) => guessCategory(s) === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q)
      );
    }
    return list;
  }, [symbols, search, activeCategory]);

  return (
    <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 w-96 overflow-hidden">
      {/* Category Tabs */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto scrollbar-none">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ativo..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-72 overflow-y-auto scrollbar-none">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum ativo encontrado
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                selectedSymbol?.id === s.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <img src={s.img} alt={s.name} className="w-6 h-6 rounded-full" />
              <span className="font-medium">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{s.code}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const CandlestickChart = ({ selectedSymbol, symbols, onSymbolChange, onPriceUpdate, activeTrades = [] }: CandlestickChartProps) => {
  const { isBrokerConnected } = useAuth();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLinesRef = useRef<Map<number, any>>(new Map());
  const lastCandleRef = useRef<ChartCandle | null>(null);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const syncInFlightRef = useRef(false);
  const lastRealtimeSyncAtRef = useRef(0);
  
  const [currentPrice, setCurrentPrice] = useState(0);
  const [stats, setStats] = useState({ open: 0, high: 0, low: 0 });
  const [showDropdown, setShowDropdown] = useState(false);
  const [dataSource, setDataSource] = useState<"unic" | "alpha">("unic");
  const [candleCountdown, setCandleCountdown] = useState(60);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");

  // Candle countdown timer
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      setCandleCountdown(60 - (now % 60));
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  // Trade entry lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const currentTradeIds = new Set(activeTrades.filter((t) => t.status === "open").map((t) => t.id));

    for (const [tradeId, priceLine] of entryLinesRef.current.entries()) {
      if (!currentTradeIds.has(tradeId)) {
        series.removePriceLine(priceLine);
        entryLinesRef.current.delete(tradeId);
      }
    }

    for (const trade of activeTrades) {
      if (trade.status === "open" && !entryLinesRef.current.has(trade.id)) {
        const isUp = trade.direction === "up";
        const priceLine = series.createPriceLine({
          price: trade.entryPrice,
          color: isUp ? "#28a745" : "#dc3545",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `${isUp ? "▲" : "▼"} R$ ${trade.amountFormatted}`,
        });
        entryLinesRef.current.set(trade.id, priceLine);
      }
    }
  }, [activeTrades]);

  // Main chart effect
  useEffect(() => {
    if (!chartContainerRef.current || !selectedSymbol) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    if (ablyClientRef.current) {
      ablyClientRef.current.close();
      ablyClientRef.current = null;
    }

    let isDisposed = false;
    let syncInterval: number | null = null;

    lastCandleRef.current = null;
    entryLinesRef.current.clear();
    syncInFlightRef.current = false;
    lastRealtimeSyncAtRef.current = 0;
    
    setRealtimeStatus("disconnected");

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a8299",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "#1e2430" },
        horzLines: { color: "#1e2430" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      crosshair: {
        vertLine: { color: "#2e8b57", width: 1 },
        horzLine: { color: "#2e8b57", width: 1 },
      },
      timeScale: {
        borderColor: "#262d3a",
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: "#262d3a",
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#28a745",
      downColor: "#dc3545",
      borderUpColor: "#28a745",
      borderDownColor: "#dc3545",
      wickUpColor: "#28a745",
      wickDownColor: "#dc3545",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const applyHistoricalData = (candles: ChartCandle[], fitContent = false) => {
      if (isDisposed || candles.length === 0) return;

      series.setData(candles as any);
      if (fitContent) {
        chart.timeScale().fitContent();
      }

      const last = candles[candles.length - 1];
      lastCandleRef.current = last;
      setCurrentPrice(last.close);
      onPriceUpdate?.(last.close);
      setStats({
        open: candles[0].open,
        high: Math.max(...candles.map((d) => d.high)),
        low: Math.min(...candles.map((d) => d.low)),
      });
    };

    const syncFromUnic = async (fitContent = false) => {
      if (!isBrokerConnected) return false;
      if (syncInFlightRef.current) return false;
      syncInFlightRef.current = true;

      try {
        const unicData = await fetchUnicCandles(selectedSymbol.code, 300);
        if (!unicData || unicData.length === 0 || isDisposed) return false;

        setDataSource("unic");
        applyHistoricalData(unicData, fitContent);
        return true;
      } finally {
        syncInFlightRef.current = false;
      }
    };

    // Load initial historical data
    const loadInitialData = async () => {
      const loadedFromUnic = await syncFromUnic(true);
      if (loadedFromUnic) return;

      setDataSource("alpha");
      const candles = await alphaApi.getHistoricalData(selectedSymbol.code);
      if (isDisposed) return;

      const chartData = candles.map((c: CandleData) => ({
        time: c.open_time as any,
        open: parseFloat(c.open),
        high: parseFloat(c.higher),
        low: parseFloat(c.lower),
        close: parseFloat(c.close),
      }));

      if (chartData.length > 0) {
        applyHistoricalData(chartData, true);
      }
    };

    const startHistoricalSync = () => {
      if (!isBrokerConnected) return;

      syncInterval = window.setInterval(() => {
        void syncFromUnic();
      }, HISTORICAL_SYNC_INTERVAL_MS);
    };

    // Connect to Ably for realtime ticks
    const connectAbly = async () => {
      if (!isBrokerConnected) {
        setRealtimeStatus("disconnected");
        return;
      }

      setRealtimeStatus("connecting");
      const tokenDetails = await fetchAblyToken();
      if (!tokenDetails || isDisposed) {
        setRealtimeStatus("disconnected");
        return;
      }

      const client = new Ably.Realtime({
        tokenDetails,
        authCallback: async (_data, callback) => {
          try {
            const newToken = await fetchAblyToken();
            if (newToken) {
              callback(null, newToken);
            } else {
              callback(new Error("Failed to refresh Ably token") as any, null);
            }
          } catch (err) {
            callback(err as any, null);
          }
        },
      });

      client.connection.on("connected", () => {
        setRealtimeStatus("connected");
      });

      client.connection.on("disconnected", () => {
        setRealtimeStatus("disconnected");
      });

      client.connection.on("failed", () => {
        setRealtimeStatus("disconnected");
      });

      const derivedChannel = client.channels.getDerived(selectedSymbol.code, {
        filter: ` (headers.esiq == \`0\` && headers.isiq == \`0\`) || (!contains(headers.esi, '"${BRAND_URL}"') && headers.esiq > \`0\`) || (contains(headers.isi, '"${BRAND_URL}"')) `,
      });

      derivedChannel.subscribe((message: Ably.Message) => {
        const tick = parseRealtimeTick(message.data);
        if (tick) {
          const now = Date.now();
          if (now - lastRealtimeSyncAtRef.current < REALTIME_SYNC_DEBOUNCE_MS) {
            return;
          }

          lastRealtimeSyncAtRef.current = now;
          void syncFromUnic();
        }
      });

      ablyClientRef.current = client;
    };

    void loadInitialData();
    startHistoricalSync();
    void connectAbly();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleResize);
      if (syncInterval !== null) {
        window.clearInterval(syncInterval);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastCandleRef.current = null;
      entryLinesRef.current.clear();
      if (ablyClientRef.current) {
        ablyClientRef.current.close();
        ablyClientRef.current = null;
      }
    };
  }, [selectedSymbol?.code, isBrokerConnected]);

  const payout = selectedSymbol ? `${Math.round((selectedSymbol.payout - 1) * 100)}%` : "85%";

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const statusColor = realtimeStatus === "connected" ? "bg-chart-green" : realtimeStatus === "connecting" ? "bg-yellow-500" : "bg-chart-red";
  const statusLabel = realtimeStatus === "connected" ? "Live" : realtimeStatus === "connecting" ? "Conectando..." : dataSource === "unic" ? "Sync" : "Offline";

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 gap-2">
        {/* Left: symbol picker */}
        <div className="flex items-center gap-2 relative shrink-0">
          {selectedSymbol && (
            <img src={selectedSymbol.img} alt={selectedSymbol.name} className="w-6 h-6 sm:w-7 sm:h-7" />
          )}
          <div
            className="cursor-pointer"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div className="flex items-center gap-1">
              <span className="font-heading font-semibold text-xs sm:text-sm text-foreground truncate max-w-[80px] sm:max-w-none">
                {selectedSymbol?.name || "Ethereum"}
              </span>
              <ChevronDown size={14} className="text-muted-foreground shrink-0" />
            </div>
          </div>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <SymbolPickerModal
                symbols={symbols}
                selectedSymbol={selectedSymbol}
                onSelect={(s) => { onSymbolChange(s); setShowDropdown(false); }}
                onClose={() => setShowDropdown(false)}
              />
            </>
          )}
        </div>

        {/* Center: price + stats inline */}
        <div className="flex items-center gap-4">
          <span className="text-lg font-heading font-bold text-foreground">
            ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">A:</span>
              <span className="text-foreground font-medium">${stats.open.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">H:</span>
              <span className="text-chart-green font-medium">${stats.high.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">L:</span>
              <span className="text-chart-red font-medium">${stats.low.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Pay:</span>
              <span className="text-chart-green font-medium">{payout}</span>
            </div>
          </div>
        </div>

        {/* Right: candle countdown + status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-mono font-bold ${candleCountdown <= 10 ? "text-chart-red" : "text-chart-green"}`}>
              {formatCountdown(candleCountdown)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor} animate-pulse-glow`} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};

export default CandlestickChart;
