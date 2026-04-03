import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Symbol as ApiSymbol } from "@/lib/api";

interface AiAnalysisToastProps {
  selectedSymbol: ApiSymbol | null;
  currentPrice: number;
  isTrading: boolean;
  lastTradeDirection?: "up" | "down" | null;
  selectedModel: string;
}

const AiAnalysisToast = ({
  selectedSymbol,
  currentPrice,
  isTrading,
  lastTradeDirection,
  selectedModel,
}: AiAnalysisToastProps) => {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [typing, setTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSymbolRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAnalysis = useCallback(async () => {
    if (!selectedSymbol || !currentPrice) return;

    try {
      const { data, error } = await supabase.functions.invoke("ai-analysis", {
        body: {
          symbol: selectedSymbol.code,
          price: currentPrice,
          variation: selectedSymbol.daily_percent_variation,
          payout: selectedSymbol.payout,
          isTrading,
          direction: lastTradeDirection || null,
          model: selectedModel,
        },
      });

      if (error) {
        console.error("AI analysis error:", error);
        return;
      }

      if (!mountedRef.current) return;

      const text = data?.analysis;
      if (!text) return;

      setMessage(text);
      setDismissed(false);
      setVisible(true);
      setIsTyping(true);
      setTyping("");

      // Typing effect
      let i = 0;
      const typeInterval = setInterval(() => {
        if (!mountedRef.current) {
          clearInterval(typeInterval);
          return;
        }
        i++;
        setTyping(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typeInterval);
          setIsTyping(false);
          // Auto-hide after 8 seconds
          setTimeout(() => {
            if (mountedRef.current) setVisible(false);
          }, 8000);
        }
      }, 30);
    } catch (err) {
      console.error("Failed to fetch AI analysis:", err);
    }
  }, [selectedSymbol, currentPrice, isTrading, lastTradeDirection, selectedModel]);

  // Trigger on symbol change
  useEffect(() => {
    if (!selectedSymbol) return;
    if (lastSymbolRef.current !== selectedSymbol.code) {
      lastSymbolRef.current = selectedSymbol.code;
      // Small delay so price has time to load
      const t = setTimeout(() => fetchAnalysis(), 2000);
      return () => clearTimeout(t);
    }
  }, [selectedSymbol, fetchAnalysis]);

  // Periodic analysis every 2-3 minutes
  useEffect(() => {
    if (!selectedSymbol) return;

    const scheduleNext = () => {
      const delay = 120000 + Math.random() * 60000; // 2-3 min
      return setTimeout(() => {
        if (mountedRef.current) {
          fetchAnalysis();
          intervalRef.current = scheduleNext() as any;
        }
      }, delay);
    };

    const timeout = scheduleNext();
    return () => clearTimeout(timeout);
  }, [selectedSymbol, fetchAnalysis]);

  // Trigger when bot starts/stops
  const prevTradingRef = useRef(isTrading);
  useEffect(() => {
    if (isTrading && !prevTradingRef.current) {
      // Bot just started
      setTimeout(() => fetchAnalysis(), 1500);
    }
    prevTradingRef.current = isTrading;
  }, [isTrading, fetchAnalysis]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!visible || dismissed || !message) return null;

  return (
    <div className="fixed bottom-4 left-16 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="relative bg-card/95 backdrop-blur-lg border border-primary/30 rounded-xl p-4 shadow-2xl shadow-primary/10">
        {/* Glow effect */}
        <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-primary/20 via-transparent to-accent/20 -z-10 blur-sm" />

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/20">
            <Brain className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary flex items-center gap-1">
            IA Analisando
            <Sparkles className="w-3 h-3" />
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-foreground leading-relaxed">
          {typing}
          {isTyping && (
            <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
};

export default AiAnalysisToast;
