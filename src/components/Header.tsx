import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Menu, LogOut, User, Settings, Link } from "lucide-react";

interface HeaderProps {
  onLoginClick: () => void;
}

const Header = ({ onLoginClick }: HeaderProps) => {
  const { user, isLoggedIn, signOut, isBrokerConnected, brokerSession } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = brokerSession?.login || user?.user_metadata?.username || user?.email?.split("@")[0] || "";

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border">
      <div className="flex-1" />
      <h1 className="font-heading text-2xl font-bold tracking-wider text-primary italic">
        ALPHA BOT
      </h1>
      <div className="flex-1 flex justify-end items-center gap-2">
        {isLoggedIn ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
            >
              <span className="text-sm text-foreground">{displayName}</span>
              {isBrokerConnected && (
                <span className="w-2 h-2 rounded-full bg-chart-green" title="Corretora conectada" />
              )}
              <Menu size={16} className="text-muted-foreground" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <User size={14} className="text-muted-foreground" />
                  Perfil
                </button>
                {!isBrokerConnected && (
                  <button
                    onClick={() => { setMenuOpen(false); onLoginClick(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary hover:bg-secondary transition-colors"
                  >
                    <Link size={14} />
                    Reconectar sessão
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <Settings size={14} className="text-muted-foreground" />
                  Configurações
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => { signOut(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-secondary transition-colors"
                >
                  <LogOut size={14} />
                  Sair
                </button>
              </div>
            )}
          </div>
        ) : (
          <Button variant="trading" size="sm" onClick={onLoginClick}>
            Login
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
