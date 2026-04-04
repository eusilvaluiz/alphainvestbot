import { ArrowUp, ArrowDown, Trash2, X, History } from "lucide-react";
import { type TradeEntry } from "@/hooks/useTradingBot";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TradeEntry[];
  onClearHistory?: () => void;
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

  const liveWinning = isOpen
    ? entry.direction === "up"
      ? entry.currentPrice > entry.entryPrice
      : entry.currentPrice < entry.entryPrice
    : false;
  const liveTied = isOpen && entry.currentPrice === entry.entryPrice;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isWin
          ? "border-chart-green/30 bg-chart-green/5"
          : isLoss
          ? "border-chart-red/30 bg-chart-red/5"
          : isOpen
          ? liveWinning
            ? "border-chart-green/20 bg-chart-green/5"
            : liveTied
            ? "border-border bg-secondary/50"
            : "border-chart-red/20 bg-chart-red/5"
          : "border-border bg-secondary/50"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{entry.symbol}</span>
          <span
            className={`w-5 h-5 rounded flex items-center justify-center ${
              entry.direction === "up"
                ? "bg-chart-green/20 text-chart-green"
                : "bg-chart-red/20 text-chart-red"
            }`}
          >
            {entry.direction === "up" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </span>
        </div>
        {isOpen && (
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                liveWinning
                  ? "bg-chart-green/20 text-chart-green"
                  : liveTied
                  ? "bg-muted text-muted-foreground"
                  : "bg-chart-red/20 text-chart-red"
              }`}
            >
              {liveWinning ? "WIN" : liveTied ? "—" : "LOSS"}
            </span>
            <span className="text-xs font-mono text-primary">{timeLeft}</span>
          </div>
        )}
        {isWin && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-chart-green/20 text-chart-green">WIN</span>
        )}
        {isLoss && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-chart-red/20 text-chart-red">LOSS</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Entrada</span>
          <p className="text-foreground font-medium">R${Number(entry.entryPrice).toFixed(2)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Valor</span>
          <p className="text-foreground font-medium">R$ {entry.amountFormatted}</p>
        </div>
        <div>
          {isOpen ? (
            <>
              <span className="text-muted-foreground">Atual</span>
              <p className={`font-medium ${liveWinning ? "text-chart-green" : liveTied ? "text-primary" : "text-chart-red"}`}>
                R${Number(entry.currentPrice).toFixed(2)}
              </p>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Resultado</span>
              <p className={`font-medium ${isWin ? "text-chart-green" : "text-chart-red"}`}>
                {isWin ? "+" : "-"}R$ {Math.abs(entry.result || 0).toFixed(2)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const HistoryModal = ({ open, onOpenChange, entries, onClearHistory }: HistoryModalProps) => {
  const wins = entries.filter((e) => e.status === "win").length;
  const losses = entries.filter((e) => e.status === "loss").length;
  const totalPL = entries.reduce((sum, e) => {
    if (e.status === "win") return sum + (e.result || 0);
    if (e.status === "loss") return sum - Math.abs(e.result || 0);
    return sum;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-lg p-0 gap-0 max-h-[80vh] flex flex-col [&>button]:hidden">
        <DialogTitle className="sr-only">Histórico de Operações</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20">
              <History className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-foreground">Histórico</h2>
              <p className="text-xs text-muted-foreground">{entries.length} operações</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats bar */}
        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-border">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Wins</p>
              <p className="text-sm font-semibold text-chart-green">{wins}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Losses</p>
              <p className="text-sm font-semibold text-chart-red">{losses}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">P&L</p>
              <p className={`text-sm font-semibold ${totalPL >= 0 ? "text-chart-green" : "text-chart-red"}`}>
                {totalPL >= 0 ? "+" : ""}R$ {totalPL.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Trade list */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-2">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <History className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma operação ainda</p>
            </div>
          ) : (
            entries.map((entry) => <TradeCard key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && onClearHistory && (
          <div className="px-5 py-3 border-t border-border">
            <button
              onClick={onClearHistory}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={14} />
              Limpar histórico
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HistoryModal;
