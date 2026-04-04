import { useState, useEffect } from "react";
import { toast } from "sonner";
import SidebarNav from "@/components/SidebarNav";
import Header from "@/components/Header";
import CandlestickChart from "@/components/CandlestickChart";
import ControlPanel from "@/components/ControlPanel";
import ConfigPanel from "@/components/ConfigPanel";
import HistoryModal from "@/components/HistoryModal";
import LoginModal from "@/components/LoginModal";
import AiAnalysisToast from "@/components/AiAnalysisToast";
import { useAuth } from "@/hooks/useAuth";
import { useTradingBot } from "@/hooks/useTradingBot";
import { alphaApi, type Symbol as ApiSymbol } from "@/lib/api";

const Index = () => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(0);
  const { isLoggedIn, isBrokerConnected, brokerSession } = useAuth();
  const [symbols, setSymbols] = useState<ApiSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<ApiSymbol | null>(null);
  const [selectedModel, setSelectedModel] = useState("grok");
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  const bot = useTradingBot();

  const handlePriceUpdate = (price: number) => {
    setCurrentPrice(price);
    bot.updateCurrentPrice(price);
  };

  const lastTradeDirection = bot.trades.length > 0 ? bot.trades[0].direction : null;

  const loadSymbols = () => {
    alphaApi.getSymbols().then((syms) => {
      if (syms.length === 0) return;
      setSymbols(syms);
      const savedCode = localStorage.getItem("selected_symbol_code");
      const savedState = localStorage.getItem("alpha_bot_state");
      let restoredSymbol: ApiSymbol | null = null;

      // Priority: dedicated key > bot state > defaults
      if (savedCode) {
        restoredSymbol = syms.find((s) => s.code === savedCode) || null;
      } else if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          if (parsed.symbolCode) {
            restoredSymbol = syms.find((s) => s.code === parsed.symbolCode) || null;
          }
        } catch {}
      }
      setSelectedSymbol(restoredSymbol || syms.find((s) => s.code === "ETHUSDT") || syms[0] || null);
      bot.resumeBot(syms);
    }).catch(() => {});
  };

  useEffect(() => {
    loadSymbols();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch symbols when broker connects (symbols require auth)
  useEffect(() => {
    if (isBrokerConnected && symbols.length === 0) {
      loadSymbols();
    }
    // Fetch live balance when broker connects
    if (isBrokerConnected) {
      alphaApi.getBalance().then((b) => {
        setLiveBalance(b.credit_cents / 100);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrokerConnected]);

  const handleStart = (config: any) => {
    if (!selectedSymbol) {
      toast.error("Selecione um ativo primeiro");
      return;
    }
    setSelectedModel(config.model);
    toast.info("Bot iniciado!", {
      description: `Modelo: ${config.model} | Entrada: R$ ${config.entryValue}`,
    });
    bot.startBot(config, selectedSymbol);
  };

  const handleStop = () => {
    bot.stopBot();
    toast.info("Bot parado");
  };

  const currentBalance = bot.isRunning
    ? bot.balance
    : liveBalance !== null
    ? liveBalance
    : brokerSession
    ? brokerSession.creditCents / 100
    : 0;

  return (
    <div className="min-h-screen bg-background flex">
      <SidebarNav onHistoryClick={() => setHistoryOpen(true)} />

      <div className="flex-1 ml-0 sm:ml-14 flex flex-col">
        <Header onLoginClick={() => setLoginOpen(true)} onHistoryClick={() => setHistoryOpen(true)} />

        <div className="flex-1 flex">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <CandlestickChart
              selectedSymbol={selectedSymbol}
              symbols={symbols}
              onSymbolChange={(s) => {
                setSelectedSymbol(s);
                localStorage.setItem("selected_symbol_code", s.code);
              }}
              onPriceUpdate={handlePriceUpdate}
              activeTrades={bot.trades}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ControlPanel
                balance={currentBalance}
                status={bot.status}
                profitLoss={bot.profitLoss}
                winRate={bot.winRate}
                operations={bot.operations}
                wins={bot.wins}
                losses={bot.losses}
                martingaleLevel={bot.currentMartingaleLevel}
                isMartingale={bot.isMartingale}
              />
              <ConfigPanel
                isLoggedIn={isBrokerConnected}
                balance={currentBalance}
                isRunning={bot.isRunning}
                isProcessing={bot.isProcessing}
                onStart={handleStart}
                onStop={handleStop}
                onModelChange={setSelectedModel}
              />
            </div>
          </div>

        </div>
      </div>

      <HistoryModal open={historyOpen} onOpenChange={setHistoryOpen} entries={bot.trades} onClearHistory={bot.clearHistory} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
      <AiAnalysisToast
        selectedSymbol={selectedSymbol}
        currentPrice={currentPrice}
        isTrading={bot.isRunning}
        lastTradeDirection={lastTradeDirection}
        selectedModel={selectedModel}
      />
    </div>
  );
};

export default Index;
