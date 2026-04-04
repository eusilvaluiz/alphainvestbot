interface ControlPanelProps {
  balance: number;
  status: string;
  profitLoss: number;
  winRate: number;
  operations: number;
  wins: number;
  losses: number;
  martingaleLevel?: number;
  isMartingale?: boolean;
}

const ControlPanel = ({
  balance = 0,
  status = "Parado",
  profitLoss = 0,
  winRate = 0,
  operations = 0,
  wins = 0,
  losses = 0,
  martingaleLevel = 0,
  isMartingale = false,
}: ControlPanelProps) => {
  const isActive = status !== "Parado";
  const total = wins + losses;
  const winPercent = total > 0 ? (wins / total) * 100 : 50;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      {/* Top row: Balance + P&L */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</span>
            <p className="text-base font-heading font-bold text-foreground leading-tight">
              R$ {balance.toFixed(2)}
            </p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">P&L</span>
            <p className={`text-base font-heading font-bold leading-tight ${profitLoss >= 0 ? "text-chart-green" : "text-chart-red"}`}>
              {profitLoss >= 0 ? "+" : ""}R$ {profitLoss.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isMartingale && martingaleLevel > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 animate-pulse">
              MG L{martingaleLevel}
            </span>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-chart-green animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-[10px] font-medium text-foreground uppercase tracking-wider">
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: Stats */}
      <div className="flex items-center gap-4">
        {/* Win Rate */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Win Rate</span>
          <span className="text-xs font-bold text-foreground">{winRate.toFixed(0)}%</span>
        </div>

        {/* Win/Loss bar */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-chart-green font-medium">{wins}W</span>
          <div className="flex-1 h-1.5 rounded-full bg-chart-red/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-chart-green transition-all duration-500"
              style={{ width: `${winPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-chart-red font-medium">{losses}L</span>
        </div>

        {/* Ops count */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Ops</span>
          <span className="text-xs font-bold text-foreground">{operations}</span>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
