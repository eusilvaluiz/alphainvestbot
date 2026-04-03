import { Terminal, BarChart3 } from "lucide-react";

interface SidebarNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SidebarNav = ({ activeTab, onTabChange }: SidebarNavProps) => {
  const items = [
    { id: "dashboard", icon: BarChart3 },
    { id: "terminal", icon: Terminal },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-14 flex flex-col items-center py-4 gap-3 bg-background border-r border-border z-50">
      <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center mb-4">
        <span className="font-heading font-bold text-primary-foreground text-sm">A</span>
      </div>
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
    </aside>
  );
};

export default SidebarNav;
