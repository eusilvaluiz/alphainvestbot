import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-center text-primary text-xl">
            ALPHA BOT
          </DialogTitle>
          <p className="text-center text-sm text-muted-foreground">Entre na sua conta</p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Email / Usuário</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-secondary border-border text-foreground"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-border text-foreground"
              placeholder="........"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="trading-ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button variant="trading" className="flex-1" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
