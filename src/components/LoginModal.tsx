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
import { X, Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
    setShowPassword(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-card border-border sm:max-w-md p-6 [&>button]:hidden">
        <DialogTitle className="sr-only">Entrar no Alpha Bot</DialogTitle>
        <DialogDescription className="sr-only">
          Faça login com o mesmo usuário e a mesma senha da sua conta Unic Broker.
        </DialogDescription>

        <div className="absolute right-4 top-4">
          <button
            onClick={resetAndClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-col items-center text-center">
          <img src={logoImg} alt="Alpha Bot" className="h-16 mb-4" />
          <h2 className="font-heading text-lg font-semibold text-foreground">Entrar</h2>
          <p className="text-sm text-muted-foreground">Use os mesmos dados da sua conta Unic Broker</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Usuário</label>
            <Input
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              className="h-12 rounded-xl border-border bg-secondary text-foreground"
              placeholder="Insira seu nome de usuário"
              required
              minLength={3}
              maxLength={30}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Senha</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl border-border bg-secondary text-foreground pr-12"
                placeholder="........"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
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

          <p className="text-center text-xs text-muted-foreground">
            Ainda não tem uma conta na Unic Broker?{" "}
            <a
              href="https://unicbroker.com/account/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80"
            >
              Clique aqui para criar uma conta
            </a>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
