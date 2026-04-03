import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";
import { ChevronDown } from "lucide-react";

const generateCandleData = () => {
  const data = [];
  let time = Math.floor(Date.now() / 1000) - 100 * 60;
  let open = 2048;

  for (let i = 0; i < 100; i++) {
    const close = open + (Math.random() - 0.48) * 5;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;

    data.push({
      time: time as any,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });

    time += 60;
    open = close;
  }
  return data;
};

const CandlestickChart = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [currentPrice, setCurrentPrice] = useState(2048.87);
  const [stats, setStats] = useState({ open: 2048.87, high: 2048.87, low: 2048.86 });

  useEffect(() => {
    if (!chartContainerRef.current) return;

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

    const data = generateCandleData();
    series.setData(data);
    chart.timeScale().fitContent();

    const lastCandle = data[data.length - 1];
    setCurrentPrice(lastCandle.close);
    setStats({
      open: data[0].open,
      high: Math.max(...data.map((d) => d.high)),
      low: Math.min(...data.map((d) => d.low)),
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    // Simulate live updates
    const interval = setInterval(() => {
      const lastData = data[data.length - 1];
      const newClose = lastData.close + (Math.random() - 0.5) * 2;
      const newCandle = {
        time: (lastData.time as number) + 60 as any,
        open: lastData.close,
        high: Math.max(lastData.close, newClose) + Math.random(),
        low: Math.min(lastData.close, newClose) - Math.random(),
        close: parseFloat(newClose.toFixed(2)),
      };
      data.push(newCandle);
      series.update(newCandle);
      setCurrentPrice(newCandle.close);
    }, 3000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src="https://zlincontent.com/cdn/icons/symbols/ethereum.png"
            alt="Ethereum"
            className="w-8 h-8"
          />
          <div>
            <div className="flex items-center gap-1">
              <span className="font-heading font-semibold text-foreground">Ethereum</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">ETH / USD</span>
          </div>
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
          { label: "PAYOUT", value: "85%", color: "text-chart-green" },
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
