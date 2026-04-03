import { Button } from "@/components/ui/button";

interface HeaderProps {
  onLoginClick: () => void;
}

const Header = ({ onLoginClick }: HeaderProps) => {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border">
      <div className="flex-1" />
      <h1 className="font-heading text-2xl font-bold tracking-wider text-primary">
        ALPHA BOT
      </h1>
      <div className="flex-1 flex justify-end">
        <Button variant="trading-outline" size="sm" onClick={onLoginClick}>
          Login
        </Button>
      </div>
    </header>
  );
};

export default Header;
