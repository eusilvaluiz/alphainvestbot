import { useState, useEffect } from "react";
import { toast } from "sonner";
import SidebarNav from "@/components/SidebarNav";
import Header from "@/components/Header";
import CandlestickChart from "@/components/CandlestickChart";
import ControlPanel from "@/components/ControlPanel";
import ConfigPanel from "@/components/ConfigPanel";
import HistorySidebar from "@/components/HistorySidebar";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/hooks/useAuth";
import { alphaApi, type Symbol as ApiSymbol } from "@/lib/api";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loginOpen, setLoginOpen] = useState(false);
  const { session, isLoggedIn } = useAuth();
  const [symbols, setSymbols] = useState<ApiSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<ApiSymbol | null>(null);

  useEffect(() => {
    alphaApi.getSymbols().then((syms) => {
      setSymbols(syms);
      const eth = syms.find((s) => s.code === "ETHUSDT");
      setSelectedSymbol(eth || syms[0] || null);
    });
  }, []);

  const handleStart = (config: any) => {
    toast.info("Bot iniciado com sucesso!", {
      description: `Modelo: ${config.model} | Entrada: R$ ${config.entryValue}`,
    });
  };

  const balance = session ? session.creditCents / 100 : 0;

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
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ControlPanel
                balance={balance}
                status="Parado"
                profitLoss={0}
                winRate={0}
                operations={0}
                wins={0}
                losses={0}
              />
              <ConfigPanel isLoggedIn={isLoggedIn} onStart={handleStart} />
            </div>
          </div>

          <div className="w-72 border-l border-border p-4 hidden xl:block">
            <HistorySidebar entries={[]} />
          </div>
        </div>
      </div>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
};

export default Index;
