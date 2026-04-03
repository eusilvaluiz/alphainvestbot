import { ArrowUp, ArrowDown, History, X } from "lucide-react";
import { type TradeEntry } from "@/hooks/useTradingBot";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface HistorySidebarProps {
  entries: TradeEntry[];
}

const TradeCard = ({ entry }: { entry: TradeEntry }) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (entry.status !== "open") return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = entry.expirationTimestamp - now;
      if (remaining <= 0) {
        setTimeLeft("00:00");
        clearInterval(interval);
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setTimeLeft(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [entry.status, entry.expirationTimestamp]);

  const isOpen = entry.status === "open";
  const isWin = entry.status === "win";
  const isLoss = entry.status === "loss";

  return (
    <div
      className={`rounded-lg border p-3 mb-2 ${
        isWin
          ? "border-chart-green/30 bg-chart-green/5"
          : isLoss
          ? "border-chart-red/30 bg-chart-red/5"
          : "border-border bg-secondary"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {entry.symbol}
          </span>
          <span
            className={`w-5 h-5 rounded flex items-center justify-center ${
              entry.direction === "up"
                ? "bg-chart-green/20 text-chart-green"
                : "bg-chart-red/20 text-chart-red"
            }`}
          >
            {entry.direction === "up" ? (
              <ArrowUp size={12} />
            ) : (
              <ArrowDown size={12} />
            )}
          </span>
        </div>
        {isOpen && (
          <span className="text-xs font-mono text-primary">{timeLeft}</span>
        )}
        {isWin && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-chart-green/20 text-chart-green">
            WIN
          </span>
        )}
        {isLoss && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-chart-red/20 text-chart-red">
            LOSS
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Entrada</span>
          <p className="text-foreground font-medium">
            R${Number(entry.entryPrice).toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Valor</span>
          <p className="text-foreground font-medium">
            R$ {entry.amountFormatted}
          </p>
        </div>
        <div>
          {isOpen ? (
            <>
              <span className="text-muted-foreground">Atual</span>
              <p className="text-primary font-medium">
                R${Number(entry.currentPrice).toFixed(2)}
              </p>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Resultado</span>
              <p
                className={`font-medium ${
                  isWin ? "text-chart-green" : "text-chart-red"
                }`}
              >
                {isWin ? "+" : "-"}R$ {Math.abs(entry.result || 0).toFixed(2)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const HistoryContent = ({ entries }: { entries: TradeEntry[] }) => (
  <div className="flex-1 overflow-y-auto px-3 py-3">
    {entries.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center mt-8">
        Nenhuma operação ainda
      </p>
    ) : (
      entries.map((entry) => (
        <TradeCard key={entry.id} entry={entry} />
      ))
    )}
  </div>
);

/** Floating button + Sheet drawer for mobile/tablet (below xl) */
export const HistoryDrawer = ({ entries = [] }: HistorySidebarProps) => {
  const openCount = entries.filter((e) => e.status === "open").length;

  return (
    <div className="xl:hidden fixed bottom-4 right-4 z-50">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            size="icon"
            variant="trading"
            className="h-12 w-12 rounded-full shadow-lg relative"
          >
            <History size={20} />
            {entries.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {entries.length}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80 sm:w-96 bg-card border-border p-0">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase">
              Histórico
            </SheetTitle>
          </SheetHeader>
          <HistoryContent entries={entries} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

/** Desktop sidebar (xl+) */
const HistorySidebar = ({ entries = [] }: HistorySidebarProps) => {
  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase">
          Histórico
        </h2>
      </div>
      <HistoryContent entries={entries} />
    </div>
  );
};

export default HistorySidebar;
