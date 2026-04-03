import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";

interface HeaderProps {
  onLoginClick: () => void;
}

const Header = ({ onLoginClick }: HeaderProps) => {
  const { session, isLoggedIn, logout } = useAuth();

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border">
      <div className="flex-1" />
      <h1 className="font-heading text-2xl font-bold tracking-wider text-primary">
        ALPHA BOT
      </h1>
      <div className="flex-1 flex justify-end items-center gap-3">
        {isLoggedIn ? (
          <>
            <span className="text-sm text-foreground">{session?.login}</span>
            <Button variant="ghost" size="icon" onClick={logout} title="Sair">
              <LogOut size={16} className="text-muted-foreground" />
            </Button>
          </>
        ) : (
          <Button variant="trading-outline" size="sm" onClick={onLoginClick}>
            Login
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
