import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";
import { ChevronDown } from "lucide-react";
import { alphaApi, type Symbol as ApiSymbol, type CandleData } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import type { TradeEntry } from "@/hooks/useTradingBot";
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

    const { data, error } = await supabase.functions.invoke("unic-chart", {
      body: {
        symbol,
        resolution: "1",
        countback,
        broker_user: user,
        broker_pass: pass,
        session_cookies: cachedSessionCookies,
      },
    });

    if (error || !data || data.s !== "ok" || !data.t?.length) return null;

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

const CandlestickChart = ({ selectedSymbol, symbols, onSymbolChange, onPriceUpdate, activeTrades = [] }: CandlestickChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLinesRef = useRef<Map<number, any>>(new Map());
  const lastCandleRef = useRef<ChartCandle | null>(null);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
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

    // Cleanup previous Ably
    if (ablyClientRef.current) {
      ablyClientRef.current.close();
      ablyClientRef.current = null;
    }

    lastCandleRef.current = null;
    entryLinesRef.current.clear();
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

    // Apply tick to current candle (same logic as traderoom)
    const applyTick = (closePrice: number, timestamp: number) => {
      const candleTime = Math.floor(timestamp / 60) * 60; // align to 1-min candle
      const last = lastCandleRef.current;

      let candle: ChartCandle;
      if (!last || last.time !== candleTime) {
        // New candle
        candle = {
          time: candleTime,
          open: last ? last.close : closePrice,
          high: closePrice,
          low: closePrice,
          close: closePrice,
        };
      } else {
        // Update existing candle
        candle = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, closePrice),
          low: Math.min(last.low, closePrice),
          close: closePrice,
        };
      }

      lastCandleRef.current = candle;
      series.update(candle as any);
      setCurrentPrice(closePrice);
      onPriceUpdate?.(closePrice);
    };

    // Load initial historical data
    const loadInitialData = async () => {
      const unicData = await fetchUnicCandles(selectedSymbol.code, 300);
      if (unicData && unicData.length > 0) {
        setDataSource("unic");
        series.setData(unicData as any);
        chart.timeScale().fitContent();

        const last = unicData[unicData.length - 1];
        lastCandleRef.current = last;
        setCurrentPrice(last.close);
        onPriceUpdate?.(last.close);
        setStats({
          open: unicData[0].open,
          high: Math.max(...unicData.map((d) => d.high)),
          low: Math.min(...unicData.map((d) => d.low)),
        });
      } else {
        setDataSource("alpha");
        const candles = await alphaApi.getHistoricalData(selectedSymbol.code);
        const chartData = candles.map((c: CandleData) => ({
          time: c.open_time as any,
          open: parseFloat(c.open),
          high: parseFloat(c.higher),
          low: parseFloat(c.lower),
          close: parseFloat(c.close),
        }));
        if (chartData.length > 0) {
          series.setData(chartData as any);
          chart.timeScale().fitContent();
          const last = chartData[chartData.length - 1];
          lastCandleRef.current = last;
          setCurrentPrice(last.close);
          onPriceUpdate?.(last.close);
          setStats({
            open: chartData[0].open,
            high: Math.max(...chartData.map((d) => d.high)),
            low: Math.min(...chartData.map((d) => d.low)),
          });
        }
      }
    };

    // Connect to Ably for realtime ticks
    const connectAbly = async () => {
      setRealtimeStatus("connecting");
      const tokenDetails = await fetchAblyToken();
      if (!tokenDetails) {
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
        console.log("[WSAB] ✅ Conectado ao realtime");
        setRealtimeStatus("connected");
      });

      client.connection.on("disconnected", () => {
        console.warn("[WSAB] ⚠️ Desconectado");
        setRealtimeStatus("disconnected");
      });

      client.connection.on("failed", () => {
        console.error("[WSAB] ❌ Falha na conexão");
        setRealtimeStatus("disconnected");
      });

      // Subscribe to symbol channel with brand filter (same as traderoom)
      const derivedChannel = client.channels.getDerived(selectedSymbol.code, {
        filter: ` (headers.esiq == \`0\` && headers.isiq == \`0\`) || (!contains(headers.esi, '"${BRAND_URL}"') && headers.esiq > \`0\`) || (contains(headers.isi, '"${BRAND_URL}"')) `,
      });

      derivedChannel.subscribe((message: Ably.Message) => {
        try {
          const data = JSON.parse(message.data as string);
          const headers = (message as any).extras?.headers || {};
          const isi = JSON.parse(headers.isi || "[]");

          // Same logic as traderoom: if ISI includes brand, allow; block public during prevention window
          if (isi.includes(BRAND_URL)) {
            // This is a manipulated tick for our brand — always apply
          }

          if (data.close !== undefined && data.time !== undefined) {
            applyTick(parseFloat(data.close), parseInt(data.time));
          }
        } catch (err) {
          console.warn("[WSAB] Parse error:", err);
        }
      });

      ablyClientRef.current = client;
    };

    void loadInitialData();
    void connectAbly();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
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
  }, [selectedSymbol?.code]);

  const payout = selectedSymbol ? `${Math.round((selectedSymbol.payout - 1) * 100)}%` : "85%";

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const statusColor = realtimeStatus === "connected" ? "bg-chart-green" : realtimeStatus === "connecting" ? "bg-yellow-500" : "bg-chart-red";
  const statusLabel = realtimeStatus === "connected" ? "Live" : realtimeStatus === "connecting" ? "Conectando..." : "Offline";

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 relative">
          {selectedSymbol && (
            <img src={selectedSymbol.img} alt={selectedSymbol.name} className="w-8 h-8" />
          )}
          <div
            className="cursor-pointer"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <div className="flex items-center gap-1">
              <span className="font-heading font-semibold text-foreground">
                {selectedSymbol?.name || "Ethereum"}
              </span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedSymbol?.code?.replace("USDT", " / USD") || "ETH / USD"}
            </span>
          </div>
          {showDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto w-56">
              {symbols.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onSymbolChange(s); setShowDropdown(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <img src={s.img} alt={s.name} className="w-5 h-5" />
                  <span>{s.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{s.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Candle:</span>
            <span className={`text-sm font-mono font-bold ${candleCountdown <= 10 ? "text-chart-red" : "text-chart-green"}`}>
              {formatCountdown(candleCountdown)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColor} animate-pulse-glow`} />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full" />

      <div className="text-center py-4">
        <span className="text-3xl font-heading font-bold text-foreground">
          ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid grid-cols-4 border-t border-border">
        {[
          { label: "ABERTURA", value: `$${stats.open.toFixed(2)}`, color: "text-foreground" },
          { label: "MÁXIMA", value: `$${stats.high.toFixed(2)}`, color: "text-chart-green" },
          { label: "MÍNIMA", value: `$${stats.low.toFixed(2)}`, color: "text-chart-red" },
          { label: "PAYOUT", value: payout, color: "text-chart-green" },
        ].map((item) => (
          <div key={item.label} className="text-center py-3 border-r border-border last:border-r-0">
            <div className="text-[10px] text-muted-foreground tracking-wider mb-1">{item.label}</div>
            <div className={`text-sm font-semibold ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CandlestickChart;
