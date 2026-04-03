import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, X, Sparkles } from "lucide-react";
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
  const [visible, setVisible] = useState(false);
  const [typing, setTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const mountedRef = useRef(true);
  const lastSymbolRef = useRef<string | null>(null);
  const hasFiredInitial = useRef(false);

  // Use refs for values that change often so fetchAnalysis doesn't re-create
  const priceRef = useRef(currentPrice);
  const isTradingRef = useRef(isTrading);
  const directionRef = useRef(lastTradeDirection);
  const symbolRef = useRef(selectedSymbol);
  const modelRef = useRef(selectedModel);

  useEffect(() => { priceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { isTradingRef.current = isTrading; }, [isTrading]);
  useEffect(() => { directionRef.current = lastTradeDirection; }, [lastTradeDirection]);
  useEffect(() => { symbolRef.current = selectedSymbol; }, [selectedSymbol]);
  useEffect(() => { modelRef.current = selectedModel; }, [selectedModel]);

  const fetchAnalysis = useCallback(async () => {
    const sym = symbolRef.current;
    if (!sym) return;

    const price = priceRef.current || parseFloat(sym.last_price) || 0;

    console.log("[AI Analysis] Fetching for", sym.code, "price:", price);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${supabaseUrl}/functions/v1/ai-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          symbol: sym.code,
          price,
          variation: sym.daily_percent_variation,
          payout: sym.payout,
          isTrading: isTradingRef.current,
          direction: directionRef.current || null,
          model: modelRef.current,
        }),
      });

      if (!resp.ok) {
        console.error("AI analysis error:", resp.status);
        return;
      }

      if (!mountedRef.current) return;

      const data = await resp.json();
      const text = data?.analysis;
      if (!text) return;

      console.log("[AI Analysis] Got:", text);

      setDismissed(false);
      setVisible(true);
      setIsTyping(true);
      setTyping("");

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
          setTimeout(() => {
            if (mountedRef.current) setVisible(false);
          }, 8000);
        }
      }, 30);
    } catch (err) {
      console.error("Failed to fetch AI analysis:", err);
    }
  }, []); // stable — reads from refs

  // Initial fetch + symbol change
  useEffect(() => {
    if (!selectedSymbol) return;

    if (lastSymbolRef.current !== selectedSymbol.code) {
      lastSymbolRef.current = selectedSymbol.code;
      hasFiredInitial.current = true;
      const t = setTimeout(() => fetchAnalysis(), 3000);
      return () => clearTimeout(t);
    }

    // First mount with same symbol (shouldn't happen but safety)
    if (!hasFiredInitial.current) {
      hasFiredInitial.current = true;
      const t = setTimeout(() => fetchAnalysis(), 3000);
      return () => clearTimeout(t);
    }
  }, [selectedSymbol, fetchAnalysis]);

  // Periodic analysis every 2-3 minutes
  useEffect(() => {
    if (!selectedSymbol) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const delay = 120000 + Math.random() * 60000;
      timeoutId = setTimeout(() => {
        if (mountedRef.current) {
          fetchAnalysis();
          scheduleNext();
        }
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [selectedSymbol, fetchAnalysis]);

  // Trigger when bot starts
  const prevTradingRef = useRef(isTrading);
  useEffect(() => {
    if (isTrading && !prevTradingRef.current) {
      setTimeout(() => fetchAnalysis(), 1500);
    }
    prevTradingRef.current = isTrading;
  }, [isTrading, fetchAnalysis]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-16 z-50 max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="relative bg-card/95 backdrop-blur-lg border border-primary/30 rounded-xl p-4 shadow-2xl shadow-primary/10">
        <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-primary/20 via-transparent to-accent/20 -z-10 blur-sm" />

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
