import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Play, Square, Save, Brain, Zap, Sparkles } from "lucide-react";

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
  onModelChange?: (model: AiModel) => void;
}

const models: { id: AiModel; label: string; icon: typeof Brain }[] = [
  { id: "grok", label: "Grok", icon: Zap },
  { id: "claude", label: "Claude", icon: Brain },
  { id: "gpt", label: "GPT", icon: Sparkles },
];

const ConfigPanel = ({
  isLoggedIn,
  balance,
  isRunning,
  isProcessing,
  onStart,
  onStop,
  onModelChange,
}: ConfigPanelProps) => {
  const { user } = useAuth();
  const [entryValue, setEntryValue] = useState(10);
  const [position, setPosition] = useState(3);
  const [stopWin, setStopWin] = useState(500);
  const [stopLoss, setStopLoss] = useState(100);
  const [selectedModel, setSelectedModel] = useState<AiModel>("grok");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [martingaleEnabled, setMartingaleEnabled] = useState(true);

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
        setEntryValue(data.entry_value);
        setPosition(data.position);
        setStopWin(data.stop_win);
        setStopLoss(data.stop_loss);
        setSelectedModel(data.model as AiModel);
        onModelChange?.(data.model as AiModel);
      } else if (isLoggedIn && balance > 0) {
        const entry = Math.round(balance * 0.05);
        setEntryValue(entry);
        setStopWin(entry * 10);
        setStopLoss(entry * 5);
      }

      setLoaded(true);
    };

    void loadConfig();
  }, [user?.id, loaded, isLoggedIn, balance]);

  const buildConfig = (): BotConfig => ({
    entryValue,
    position: martingaleEnabled ? position : 0,
    stopWin,
    stopLoss,
    model: selectedModel,
  });

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    try {
      const config = buildConfig();
      const payload = {
        user_id: user.id,
        entry_value: config.entryValue,
        position: config.position,
        stop_win: config.stopWin,
        stop_loss: config.stopLoss,
        model: config.model,
        is_active: true,
        name: "Padrão",
      };

      const { data: existing, error: readError } = await supabase
        .from("bot_configs")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (readError) throw readError;

      if (existing?.id) {
        const { error } = await supabase.from("bot_configs").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bot_configs").insert(payload);
        if (error) throw error;
      }

      toast.success("Configuração salva");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  const handleStart = () => onStart(buildConfig());

  const maxEntry = Math.max(balance || 1000, 1000);
  const maxStop = Math.max(balance * 2 || 5000, 5000);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-4">
      {/* Model selector chips */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5 sm:mr-1">IA</span>
        {models.map((model) => {
          const Icon = model.icon;
          const active = selectedModel === model.id;
          return (
            <button
              key={model.id}
              onClick={() => {
                if (!isRunning) {
                  setSelectedModel(model.id);
                  onModelChange?.(model.id);
                }
              }}
              disabled={isRunning}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all duration-200 ${
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              } ${isRunning ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <Icon size={11} />
              {model.label}
            </button>
          );
        })}
      </div>

      {/* Row 1: Entrada + Martingale */}
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block h-4 leading-4">Entrada</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={entryValue}
              onChange={(e) => setEntryValue(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              disabled={isRunning}
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5 h-4">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider leading-4">Martingale</label>
            <Switch
              checked={martingaleEnabled}
              onCheckedChange={setMartingaleEnabled}
              disabled={isRunning}
              className="scale-[0.6] origin-right"
            />
          </div>
          {martingaleEnabled ? (
            <input
              type="text"
              inputMode="numeric"
              value={position}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/[^0-9]/g, "")) || 1;
                setPosition(Math.min(10, Math.max(1, v)));
              }}
              disabled={isRunning}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-base sm:text-xs font-bold text-foreground outline-none focus:border-yellow-500/50 transition-colors disabled:opacity-50"
            />
          ) : (
            <input
              type="text"
              disabled
              value="Desativado"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-base sm:text-xs text-muted-foreground outline-none disabled:opacity-50"
            />
          )}
        </div>
      </div>

      {/* Row 2: Stop Win + Stop Loss */}
      <div className="grid grid-cols-2 gap-x-4">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Stop Win</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={stopWin}
              onChange={(e) => setStopWin(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              disabled={isRunning}
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-xs font-bold text-chart-green outline-none focus:border-chart-green/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Stop Loss</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
              disabled={isRunning}
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-xs font-bold text-chart-red outline-none focus:border-chart-red/50 transition-colors disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {isRunning ? (
        <button
          onClick={onStop}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-heading font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-chart-red to-red-600 text-white shadow-lg shadow-chart-red/20 hover:shadow-chart-red/40 transition-all duration-300 disabled:opacity-50"
        >
          <Square size={16} />
          {isProcessing ? "Processando..." : "Parar Bot"}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!isLoggedIn || saving}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "..." : "Salvar"}
          </button>
          <button
            onClick={handleStart}
            disabled={!isLoggedIn}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-heading font-bold text-sm uppercase tracking-wider bg-gradient-to-r from-chart-green to-emerald-500 text-white shadow-lg shadow-chart-green/20 hover:shadow-chart-green/40 transition-all duration-300 disabled:opacity-50"
          >
            <Play size={16} />
            {isLoggedIn ? "Iniciar Bot" : "Login Necessário"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;
