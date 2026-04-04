import { History, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import logoImg from "@/assets/alphabot.png";

interface SidebarNavProps {
  onHistoryClick: () => void;
}

const SidebarNav = ({ onHistoryClick }: SidebarNavProps) => {
  const { user, isLoggedIn, signOut, brokerSession } = useAuth();

  const displayName = brokerSession?.login || user?.user_metadata?.username || user?.email || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="fixed left-0 top-0 h-full w-14 flex flex-col items-center py-4 bg-background border-r border-border z-50">
      <button
        onClick={onHistoryClick}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors mb-4"
        title="Histórico de operações"
      >
        <History size={20} className="text-primary" />
      </button>

      <div className="mt-auto flex flex-col items-center gap-3">
        {isLoggedIn && (
          <>
            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
              <span className="text-xs font-semibold text-foreground">{initials}</span>
            </div>
            <button
              onClick={signOut}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};

export default SidebarNav;
