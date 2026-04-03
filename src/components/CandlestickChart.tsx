import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, ColorType } from "lightweight-charts";
import { ChevronDown } from "lucide-react";
import { alphaApi, type Symbol as ApiSymbol, type CandleData } from "@/lib/api";

interface CandlestickChartProps {
  selectedSymbol: ApiSymbol | null;
  symbols: ApiSymbol[];
  onSymbolChange: (symbol: ApiSymbol) => void;
  onPriceUpdate?: (price: number) => void;
}

const CandlestickChart = ({ selectedSymbol, symbols, onSymbolChange, onPriceUpdate }: CandlestickChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [stats, setStats] = useState({ open: 0, high: 0, low: 0 });
  const [showDropdown, setShowDropdown] = useState(false);

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

    alphaApi.getHistoricalData(selectedSymbol.code).then((candles: CandleData[]) => {
      if (candles.length === 0) return;

      const chartData = candles.map((c) => ({
        time: c.open_time as any,
        open: parseFloat(c.open),
        high: parseFloat(c.higher),
        low: parseFloat(c.lower),
        close: parseFloat(c.close),
      }));

      series.setData(chartData);
      chart.timeScale().fitContent();

      const last = chartData[chartData.length - 1];
      setCurrentPrice(last.close);
      setStats({
        open: chartData[0].open,
        high: Math.max(...chartData.map((d) => d.high)),
        low: Math.min(...chartData.map((d) => d.low)),
      });
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    // Poll for updates
    const interval = setInterval(async () => {
      try {
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
        }
      } catch {}
    }, 5000);

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
          <span className="w-2 h-2 rounded-full bg-chart-green animate-pulse-glow" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Ao Vivo</span>
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
