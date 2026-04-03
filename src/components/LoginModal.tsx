import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { X } from "lucide-react";

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
      <DialogContent className="bg-card border-border sm:max-w-md p-6 [&>button]:hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-heading font-bold text-primary-foreground text-lg">A</span>
            </div>
            <div>
              <h2 className="font-heading font-semibold text-foreground text-lg">Bem-vindo de Volta</h2>
              <p className="text-sm text-muted-foreground">Entre na sua conta</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Email / Usuário</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-secondary border-border text-foreground h-12 rounded-xl"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-border text-foreground h-12 rounded-xl"
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
              className="flex-1 h-12 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button variant="trading" className="flex-1 h-12 rounded-xl" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
          <div className="border-t border-border pt-4 text-center">
            <span className="text-sm text-muted-foreground">Não tem uma conta? </span>
            <a href="#" className="text-sm text-primary hover:underline">Cadastre-se</a>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
