import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, ColorType } from "lightweight-charts";
import { ChevronDown } from "lucide-react";
import { alphaApi, type Symbol as ApiSymbol } from "@/lib/api";

interface UdfHistoryResponse {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

interface CandlestickChartProps {
  selectedSymbol: ApiSymbol | null;
  symbols: ApiSymbol[];
  onSymbolChange: (symbol: ApiSymbol) => void;
  onPriceUpdate?: (price: number) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const fetchUdfHistory = async (symbol: string, countback = 300): Promise<UdfHistoryResponse | null> => {
  const storedCreds = localStorage.getItem("broker_credentials");
  if (!storedCreds) return null;

  const { user, pass } = JSON.parse(storedCreds);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/unic-chart`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol,
        resolution: "1",
        countback,
        broker_user: user,
        broker_pass: pass,
      }),
    });

    if (!res.ok) return null;
    const data: UdfHistoryResponse = await res.json();
    if (data.s !== "ok" || !data.t?.length) return null;
    return data;
  } catch {
    return null;
  }
};

// Fallback: use alpha API historical data
const fetchAlphaHistory = async (symbol: string) => {
  try {
    const candles = await alphaApi.getHistoricalData(symbol);
    if (!candles.length) return null;
    return candles.map((c) => ({
      time: c.open_time as any,
      open: parseFloat(c.open),
      high: parseFloat(c.higher),
      low: parseFloat(c.lower),
      close: parseFloat(c.close),
    }));
  } catch {
    return null;
  }
};

const udfToChartData = (udf: UdfHistoryResponse) => {
  return udf.t.map((time, i) => ({
    time: time as any,
    open: udf.o[i],
    high: udf.h[i],
    low: udf.l[i],
    close: udf.c[i],
  }));
};

const CandlestickChart = ({ selectedSymbol, symbols, onSymbolChange, onPriceUpdate }: CandlestickChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [stats, setStats] = useState({ open: 0, high: 0, low: 0 });
  const [showDropdown, setShowDropdown] = useState(false);
  const [dataSource, setDataSource] = useState<"unic" | "alpha">("alpha");

  useEffect(() => {
    if (!chartContainerRef.current || !selectedSymbol) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

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

    const loadData = async () => {
      // Try Unic UDF first (has manipulated candles)
      const udf = await fetchUdfHistory(selectedSymbol.code);
      if (udf) {
        const chartData = udfToChartData(udf);
        series.setData(chartData);
        chart.timeScale().fitContent();
        setDataSource("unic");

        const last = chartData[chartData.length - 1];
        setCurrentPrice(last.close);
        onPriceUpdate?.(last.close);
        setStats({
          open: chartData[0].open,
          high: Math.max(...chartData.map((d) => d.high)),
          low: Math.min(...chartData.map((d) => d.low)),
        });
        return;
      }

      // Fallback to alpha API
      const alphaData = await fetchAlphaHistory(selectedSymbol.code);
      if (alphaData && alphaData.length > 0) {
        series.setData(alphaData);
        chart.timeScale().fitContent();
        setDataSource("alpha");

        const last = alphaData[alphaData.length - 1];
        setCurrentPrice(last.close);
        onPriceUpdate?.(last.close);
        setStats({
          open: alphaData[0].open,
          high: Math.max(...alphaData.map((d) => d.high)),
          low: Math.min(...alphaData.map((d) => d.low)),
        });
      }
    };

    loadData();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    // Poll for updates
    const interval = setInterval(async () => {
      try {
        if (dataSource === "unic") {
          const udf = await fetchUdfHistory(selectedSymbol.code, 5);
          if (udf && udf.t.length > 0) {
            const lastIdx = udf.t.length - 1;
            const newCandle = {
              time: udf.t[lastIdx] as any,
              open: udf.o[lastIdx],
              high: udf.h[lastIdx],
              low: udf.l[lastIdx],
              close: udf.c[lastIdx],
            };
            series.update(newCandle);
            setCurrentPrice(newCandle.close);
            onPriceUpdate?.(newCandle.close);
          }
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
    };
  }, [selectedSymbol?.code]);

  const payout = selectedSymbol ? `${Math.round((selectedSymbol.payout - 1) * 100)}%` : "85%";

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
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dataSource === "unic" ? "bg-chart-green" : "bg-yellow-500"} animate-pulse-glow`} />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {dataSource === "unic" ? "Traderoom" : "Ao Vivo"}
          </span>
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
