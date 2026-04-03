import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { X } from "lucide-react";
import { toast } from "sonner";
import logoImg from "@/assets/alphabot.png";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, loading, error } = useAuth();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(username, password);
      toast.success("Login realizado!");
      onOpenChange(false);
    } catch {}
  };

  const resetAndClose = () => {
    setUsername("");
    setPassword("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-card border-border sm:max-w-md p-6 [&>button]:hidden">
        <DialogTitle className="sr-only">Entrar no Alpha Bot</DialogTitle>
        <DialogDescription className="sr-only">
          Faça login com o mesmo usuário e a mesma senha da sua conta Unic Broker.
        </DialogDescription>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Alpha Bot" className="h-8" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">Entrar</h2>
              <p className="text-sm text-muted-foreground">Use os mesmos dados da sua conta Unic Broker</p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <p className="rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            O login aqui é igual ao site base: mesmo usuário, mesma senha e sessão de trade já conectada.
          </p>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Usuário</label>
            <Input
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              className="h-12 rounded-xl border-border bg-secondary text-foreground"
              placeholder="clodoaldo123"
              required
              minLength={3}
              maxLength={30}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl border-border bg-secondary text-foreground"
              placeholder="........"
              required
            />
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="trading-ghost"
              className="flex-1 h-12 rounded-xl"
              onClick={resetAndClose}
            >
              Cancelar
            </Button>
            <Button variant="trading" className="flex-1 h-12 rounded-xl" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
