interface HistoryEntry {
  id: string;
  type: "win" | "loss";
  amount: number;
  time: string;
  asset: string;
}

interface HistorySidebarProps {
  entries: HistoryEntry[];
}

const HistorySidebar = ({ entries = [] }: HistorySidebarProps) => {
  return (
    <div className="bg-card rounded-lg border border-border h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase">
          Histórico
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Nenhuma operação ainda
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <div>
                  <p className="text-sm text-foreground">{entry.asset}</p>
                  <p className="text-xs text-muted-foreground">{entry.time}</p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    entry.type === "win" ? "text-chart-green" : "text-chart-red"
                  }`}
                >
                  {entry.type === "win" ? "+" : "-"}R$ {entry.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;
