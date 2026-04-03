import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Save } from "lucide-react";
import { toast } from "sonner";

type AiModel = "grok" | "claude" | "gpt";

export interface BotConfig {
  entryValue: number;
  position: number;
  stopWin: number;
  stopLoss: number;
  model: AiModel;
}

interface ConfigPanelProps {
  isLoggedIn: boolean;
  balance: number;
  isRunning: boolean;
  isProcessing: boolean;
  onStart: (config: BotConfig) => void;
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
  const { user } = useAuth();
  const [entryValue, setEntryValue] = useState("10");
  const [position, setPosition] = useState("3");
  const [stopWin, setStopWin] = useState("500");
  const [stopLoss, setStopLoss] = useState("100");
  const [selectedModel, setSelectedModel] = useState<AiModel>("grok");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load saved config when user logs in
  useEffect(() => {
    if (!user?.id || loaded) return;

    const loadConfig = async () => {
      const { data } = await supabase
        .from("bot_configs")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setEntryValue(String(data.entry_value));
        setPosition(String(data.position));
        setStopWin(String(data.stop_win));
        setStopLoss(String(data.stop_loss));
        setSelectedModel(data.model as AiModel);
      }
      setLoaded(true);
    };

    loadConfig();
  }, [user?.id, loaded]);

  // Auto-calculate based on balance only if no saved config
  useEffect(() => {
    if (isLoggedIn && balance > 0 && !isRunning && !loaded) {
      const entry = Math.round(balance * 0.05);
      setEntryValue(String(entry));
      setStopWin(String(entry * 10));
      setStopLoss(String(entry * 5));
    }
  }, [isLoggedIn, balance, isRunning, loaded]);

  const models: { id: AiModel; label: string }[] = [
    { id: "grok", label: "Grok 4.1" },
    { id: "claude", label: "Claude 4.5" },
    { id: "gpt", label: "GPT 5.1" },
  ];

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    try {
      const payload = {
        user_id: user.id,
        entry_value: parseFloat(entryValue) || 10,
        position: parseInt(position) || 3,
        stop_win: parseFloat(stopWin) || 500,
        stop_loss: parseFloat(stopLoss) || 100,
        model: selectedModel,
        is_active: true,
        name: "Padrão",
      };

      // Check if config already exists
      const { data: existing } = await supabase
        .from("bot_configs")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("bot_configs")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bot_configs")
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Configuração salva!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-heading font-semibold text-muted-foreground tracking-wider uppercase">
          Configuração
        </h2>
        {isLoggedIn && !isRunning && (
          <Button
            variant="trading-ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        )}
      </div>

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
