import { useState, useEffect } from "react";
import { toast } from "sonner";
import SidebarNav from "@/components/SidebarNav";
import Header from "@/components/Header";
import CandlestickChart from "@/components/CandlestickChart";
import ControlPanel from "@/components/ControlPanel";
import ConfigPanel from "@/components/ConfigPanel";
import HistorySidebar, { HistoryDrawer } from "@/components/HistorySidebar";
import LoginModal from "@/components/LoginModal";
import AiAnalysisToast from "@/components/AiAnalysisToast";
import { useAuth } from "@/hooks/useAuth";
import { useTradingBot } from "@/hooks/useTradingBot";
import { alphaApi, type Symbol as ApiSymbol } from "@/lib/api";

const Index = () => {
  const [activeTab, setActiveTab] = useState("terminal");
  const [loginOpen, setLoginOpen] = useState(false);
  const { isLoggedIn, isBrokerConnected, brokerSession } = useAuth();
  const [symbols, setSymbols] = useState<ApiSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<ApiSymbol | null>(null);

  const bot = useTradingBot();

  useEffect(() => {
    alphaApi.getSymbols().then((syms) => {
      setSymbols(syms);
      const eth = syms.find((s) => s.code === "ETHUSDT");
      setSelectedSymbol(eth || syms[0] || null);
      // Resume bot if it was running before refresh
      bot.resumeBot(syms);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = (config: any) => {
    if (!selectedSymbol) {
      toast.error("Selecione um ativo primeiro");
      return;
    }
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
    : brokerSession
    ? brokerSession.creditCents / 100
    : 0;

  return (
    <div className="min-h-screen bg-background flex">
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 ml-14 flex flex-col">
        <Header onLoginClick={() => setLoginOpen(true)} />

        <div className="flex-1 flex">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <CandlestickChart
              selectedSymbol={selectedSymbol}
              symbols={symbols}
              onSymbolChange={setSelectedSymbol}
              onPriceUpdate={bot.updateCurrentPrice}
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
              />
            </div>
          </div>

          <div className="w-72 border-l border-border p-4 hidden xl:block">
            <HistorySidebar entries={bot.trades} />
          </div>
        </div>
      </div>

      <HistoryDrawer entries={bot.trades} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
};

export default Index;
