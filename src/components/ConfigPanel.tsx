import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AiModel = "grok" | "claude" | "gpt";

interface ConfigPanelProps {
  isLoggedIn: boolean;
  balance: number;
  isRunning: boolean;
  isProcessing: boolean;
  onStart: (config: {
    entryValue: number;
    position: number;
    stopWin: number;
    stopLoss: number;
    model: AiModel;
  }) => void;
  onStop: () => void;
}

const ConfigPanel = ({
  isLoggedIn,
  balance,
  isRunning,
  isProcessing,
  onStart,
  onStop,
}: ConfigPanelProps) => {
  const [entryValue, setEntryValue] = useState("10");
  const [position, setPosition] = useState("3");
  const [stopWin, setStopWin] = useState("500");
  const [stopLoss, setStopLoss] = useState("100");
  const [selectedModel, setSelectedModel] = useState<AiModel>("grok");

  // Auto-calculate based on balance when logged in
  useEffect(() => {
    if (isLoggedIn && balance > 0 && !isRunning) {
      const entry = Math.round(balance * 0.05);
      setEntryValue(String(entry));
      setStopWin(String(entry * 10));
      setStopLoss(String(entry * 5));
    }
  }, [isLoggedIn, balance, isRunning]);

  const models: { id: AiModel; label: string }[] = [
    { id: "grok", label: "Grok 4.1" },
    { id: "claude", label: "Claude 4.5" },
    { id: "gpt", label: "GPT 5.1" },
  ];

  const handleStart = () => {
    onStart({
      entryValue: parseFloat(entryValue),
      position: parseInt(position),
      stopWin: parseFloat(stopWin),
      stopLoss: parseFloat(stopLoss),
      model: selectedModel,
    });
  };

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <h2 className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase mb-4">
        Configuração
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Valor de Entrada
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                value={entryValue}
                onChange={(e) => setEntryValue(e.target.value)}
                className="pl-9 bg-secondary border-border text-foreground"
                disabled={isRunning}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground">Posição</label>
              <span className="text-xs text-primary">2x</span>
            </div>
            <Input
              type="number"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="bg-secondary border-border text-foreground"
              disabled={isRunning}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Stop Win
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                value={stopWin}
                onChange={(e) => setStopWin(e.target.value)}
                className="pl-9 bg-secondary border-border text-foreground"
                disabled={isRunning}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Stop Loss
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="pl-9 bg-secondary border-border text-foreground text-chart-red"
                disabled={isRunning}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {models.map((model) => (
            <Button
              key={model.id}
              variant={selectedModel === model.id ? "trading" : "trading-ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setSelectedModel(model.id)}
              disabled={isRunning}
            >
              {model.label}
            </Button>
          ))}
        </div>

        {isRunning ? (
          <Button
            variant="destructive"
            className="w-full"
            onClick={onStop}
            disabled={isProcessing}
          >
            {isProcessing ? "Processando..." : "Stop"}
          </Button>
        ) : (
          <Button
            variant="trading"
            className="w-full"
            onClick={handleStart}
            disabled={!isLoggedIn}
          >
            {isLoggedIn ? "Start" : "Login Necessário"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ConfigPanel;
