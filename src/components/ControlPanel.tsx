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
  stopWin?: number;
  stopLoss?: number;
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
  stopWin = 0,
  stopLoss = 0,
}: ControlPanelProps) => {
  const isActive = status !== "Parado";

  // Calculate P&L position between stopLoss (-) and stopWin (+)
  // 0% = stopLoss, 50% = zero, 100% = stopWin
  const totalRange = stopWin + stopLoss;
  let plPercent = 50; // default center
  if (totalRange > 0) {
    // Map profitLoss from [-stopLoss, +stopWin] to [0, 100]
    const clamped = Math.max(-stopLoss, Math.min(stopWin, profitLoss));
    plPercent = ((clamped + stopLoss) / totalRange) * 100;
  }

  const isProfit = profitLoss >= 0;

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
            <p className={`text-base font-heading font-bold leading-tight ${isProfit ? "text-chart-green" : "text-chart-red"}`}>
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

      {/* Bottom row: Stats + P&L progress bar */}
      <div className="flex items-center gap-4">
        {/* Win Rate */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Win Rate</span>
          <span className="text-xs font-bold text-foreground">{winRate.toFixed(0)}%</span>
        </div>

        {/* P&L progress bar: center-origin, green right, red left */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-chart-red font-medium">-{stopLoss}</span>
          <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden relative">
            {/* Center marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/50 z-10" />
            {/* Colored fill from center */}
            {isProfit ? (
              <div
                className="absolute top-0 bottom-0 rounded-r-full bg-chart-green/80 transition-all duration-500"
                style={{
                  left: '50%',
                  width: `${plPercent - 50}%`,
                }}
              />
            ) : (
              <div
                className="absolute top-0 bottom-0 rounded-l-full bg-chart-red/80 transition-all duration-500"
                style={{
                  right: '50%',
                  width: `${50 - plPercent}%`,
                }}
              />
            )}
          </div>
          <span className="text-[10px] text-chart-green font-medium">+{stopWin}</span>
        </div>

        {/* W/L + Ops */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-chart-green font-medium">{wins}W</span>
          <span className="text-[10px] text-chart-red font-medium">{losses}L</span>
          <span className="text-[10px] text-muted-foreground">Ops</span>
          <span className="text-xs font-bold text-foreground">{operations}</span>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
