import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";
import { ChevronDown } from "lucide-react";
import { alphaApi, type Symbol as ApiSymbol, type CandleData } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import type { TradeEntry } from "@/hooks/useTradingBot";

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

async function fetchUnicCandles(symbol: string, countback = 300) {
  try {
    const stored = localStorage.getItem("broker_credentials");
    if (!stored) return null;
    const { user, pass } = JSON.parse(stored);
    if (!user || !pass) return null;

    const { data, error } = await supabase.functions.invoke("unic-chart", {
      body: { symbol, resolution: "1", countback, broker_user: user, broker_pass: pass },
    });

    if (error || !data || data.s !== "ok" || !data.t?.length) return null;
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

const CandlestickChart = ({ selectedSymbol, symbols, onSymbolChange, onPriceUpdate, activeTrades = [] }: CandlestickChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const entryLinesRef = useRef<Map<number, any>>(new Map());
  const [currentPrice, setCurrentPrice] = useState(0);
  const [stats, setStats] = useState({ open: 0, high: 0, low: 0 });
  const [showDropdown, setShowDropdown] = useState(false);
  const [dataSource, setDataSource] = useState<"unic" | "alpha">("unic");
  const [candleCountdown, setCandleCountdown] = useState(60);

  // Candle countdown timer (1-minute candles)
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const secondsIntoCandle = now % 60;
      setCandleCountdown(60 - secondsIntoCandle);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  // Draw/remove entry price lines when trades change
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const currentTradeIds = new Set(activeTrades.filter(t => t.status === "open").map(t => t.id));
    
    // Remove lines for closed trades
    for (const [tradeId, priceLine] of entryLinesRef.current.entries()) {
      if (!currentTradeIds.has(tradeId)) {
        series.removePriceLine(priceLine);
        entryLinesRef.current.delete(tradeId);
      }
    }

    // Add lines for new open trades
    for (const trade of activeTrades) {
      if (trade.status === "open" && !entryLinesRef.current.has(trade.id)) {
        const isUp = trade.direction === "up";
        const priceLine = series.createPriceLine({
          price: trade.entryPrice,
          color: isUp ? "#28a745" : "#dc3545",
          lineWidth: 2,
          lineStyle: 0, // solid
          axisLabelVisible: true,
          title: `${isUp ? "▲" : "▼"} R$ ${trade.amountFormatted}`,
        });
        entryLinesRef.current.set(trade.id, priceLine);
      }
    }
  }, [activeTrades]);

  useEffect(() => {
    if (!chartContainerRef.current || !selectedSymbol) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    entryLinesRef.current.clear();

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

    const applyChartData = (chartData: { time: any; open: number; high: number; low: number; close: number }[]) => {
      if (chartData.length === 0) return;
      series.setData(chartData as any);
      chart.timeScale().fitContent();
      const last = chartData[chartData.length - 1];
      setCurrentPrice(last.close);
      onPriceUpdate?.(last.close);
      setStats({
        open: chartData[0].open,
        high: Math.max(...chartData.map((d) => d.high)),
        low: Math.min(...chartData.map((d) => d.low)),
      });
    };

    (async () => {
      const unicData = await fetchUnicCandles(selectedSymbol.code, 300);
      if (unicData && unicData.length > 0) {
        setDataSource("unic");
        applyChartData(unicData);
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
        applyChartData(chartData);
      }
    })();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    const interval = setInterval(async () => {
      try {
        const unicData = await fetchUnicCandles(selectedSymbol.code, 5);
        if (unicData && unicData.length > 0) {
          const last = unicData[unicData.length - 1];
          series.update(last as any);
          setCurrentPrice(last.close);
          onPriceUpdate?.(last.close);
        } else {
          const candles = await alphaApi.getHistoricalData(selectedSymbol.code);
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            const newCandle = {
              time: last.open_time as any,
              open: parseFloat(last.open),
              high: parseFloat(last.higher),
              low: parseFloat(last.lower),
              close: parseFloat(last.close),
            };
            series.update(newCandle);
            setCurrentPrice(newCandle.close);
            onPriceUpdate?.(newCandle.close);
          }
        }
      } catch {}
    }, 3000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      entryLinesRef.current.clear();
    };
  }, [selectedSymbol?.code]);

  const payout = selectedSymbol ? `${Math.round((selectedSymbol.payout - 1) * 100)}%` : "85%";

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
          {/* Candle countdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Candle:</span>
            <span className={`text-sm font-mono font-bold ${candleCountdown <= 10 ? "text-chart-red" : "text-chart-green"}`}>
              {formatCountdown(candleCountdown)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dataSource === "unic" ? "bg-chart-green" : "bg-yellow-500"} animate-pulse-glow`} />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {dataSource === "unic" ? "Traderoom" : "Alpha"}
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
