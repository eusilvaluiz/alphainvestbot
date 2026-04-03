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
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h2 className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase mb-4">
        Painel de Controle
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Saldo</span>
          <p className="text-lg font-semibold text-foreground mt-1">
            R$ {balance.toFixed(2)}
          </p>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Status</span>
          <div className="mt-1">
            <p className="text-lg font-semibold text-foreground flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status !== "Parado" ? "bg-chart-green animate-pulse" : "bg-muted-foreground"}`} />
              {status}
            </p>
            {isMartingale && martingaleLevel > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 mt-1 inline-block">
                M L{martingaleLevel}
              </span>
            )}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Lucro / Perda</span>
          <p className={`text-lg font-semibold mt-1 ${profitLoss >= 0 ? "text-chart-green" : "text-chart-red"}`}>
            {profitLoss >= 0 ? "+" : ""}R$ {profitLoss.toFixed(2)}
          </p>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Taxa de Acerto</span>
          <p className="text-lg font-semibold text-foreground mt-1">{winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Operações</span>
          <p className="text-lg font-semibold text-foreground mt-1">{operations}</p>
        </div>
        <div className="bg-secondary rounded-lg p-3">
          <span className="text-xs text-muted-foreground">Acertos / Erros</span>
          <p className="text-lg font-semibold mt-1">
            <span className="text-chart-green">{wins}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-chart-red">{losses}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
