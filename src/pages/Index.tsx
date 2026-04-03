import { useState } from "react";
import { toast } from "sonner";
import SidebarNav from "@/components/SidebarNav";
import Header from "@/components/Header";
import CandlestickChart from "@/components/CandlestickChart";
import ControlPanel from "@/components/ControlPanel";
import ConfigPanel from "@/components/ConfigPanel";
import HistorySidebar from "@/components/HistorySidebar";
import LoginModal from "@/components/LoginModal";

const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loginOpen, setLoginOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");

  const handleLogin = async (user: string, pass: string) => {
    // Placeholder - will integrate with real auth later
    if (user && pass) {
      setIsLoggedIn(true);
      setUsername(user);
      setLoginOpen(false);
      toast.success(`Bem-vindo, ${user}!`);
    } else {
      toast.error("Credenciais inválidas");
    }
  };

  const handleStart = (config: any) => {
    toast.info("Bot iniciado com sucesso!", {
      description: `Modelo: ${config.model} | Entrada: R$ ${config.entryValue}`,
    });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 ml-14 flex flex-col">
        <Header onLoginClick={() => setLoginOpen(true)} />

        <div className="flex-1 flex">
          {/* Main Content */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <CandlestickChart />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ControlPanel
                balance={0}
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

          {/* History Sidebar */}
          <div className="w-72 border-l border-border p-4 hidden xl:block">
            <HistorySidebar entries={[]} />
          </div>
        </div>
      </div>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} onLogin={handleLogin} />
    </div>
  );
};

export default Index;
