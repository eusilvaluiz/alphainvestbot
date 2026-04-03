import { Terminal, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SidebarNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SidebarNav = ({ activeTab, onTabChange }: SidebarNavProps) => {
  const { user, isLoggedIn, signOut, brokerSession } = useAuth();

  const items = [
    { id: "terminal", icon: Terminal },
  ];

  const displayName = brokerSession?.login || user?.user_metadata?.username || user?.email || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="fixed left-0 top-0 h-full w-14 flex flex-col items-center py-4 bg-background border-r border-border z-50">
      <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center mb-4">
        <span className="font-heading font-bold text-primary-foreground text-sm">A</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                isActive
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>

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
