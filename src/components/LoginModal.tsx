import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { X } from "lucide-react";
import { toast } from "sonner";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AuthMode = "login" | "signup" | "broker";

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [brokerUser, setBrokerUser] = useState("");
  const [brokerPass, setBrokerPass] = useState("");

  const {
    signIn, signUp, loading, error,
    connectBroker, brokerLoading, brokerError,
    isLoggedIn, isBrokerConnected,
  } = useAuth();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "signup") {
        await signUp(email, password, username, name);
        toast.success("Conta criada! Verifique seu email.");
        setMode("broker");
      } else {
        await signIn(identifier, password);
        toast.success("Login realizado!");
        if (!isBrokerConnected) {
          setMode("broker");
        } else {
          onOpenChange(false);
        }
      }
    } catch {}
  };

  const handleBrokerConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await connectBroker(brokerUser, brokerPass);
      toast.success("Corretora conectada!");
      onOpenChange(false);
    } catch {}
  };

  const resetAndClose = () => {
    setMode("login");
    setIdentifier("");
    setEmail("");
    setPassword("");
    setName("");
    setUsername("");
    setBrokerUser("");
    setBrokerPass("");
    onOpenChange(false);
  };

  // If logged in but no broker, show broker connect
  if (isLoggedIn && !isBrokerConnected && open && mode !== "broker") {
    setMode("broker");
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-card border-border sm:max-w-md p-6 [&>button]:hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="font-heading font-bold text-primary-foreground text-lg">A</span>
            </div>
            <div>
              <h2 className="font-heading font-semibold text-foreground text-lg">
                {mode === "broker" ? "Conectar Corretora" : mode === "signup" ? "Criar Conta" : "Bem-vindo de Volta"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "broker" ? "Vincule sua conta Unic Broker" : mode === "signup" ? "Crie sua conta Alpha Bot" : "Entre na sua conta"}
              </p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {mode === "broker" ? (
          <form onSubmit={handleBrokerConnect} className="space-y-4">
            <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
              Conecte sua conta da Unic Broker para operar. Suas credenciais ficam salvas com segurança.
            </p>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Usuário da Corretora</label>
              <Input
                value={brokerUser}
                onChange={(e) => setBrokerUser(e.target.value)}
                className="bg-secondary border-border text-foreground h-12 rounded-xl"
                placeholder="seu_usuario"
                required
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Senha da Corretora</label>
              <Input
                type="password"
                value={brokerPass}
                onChange={(e) => setBrokerPass(e.target.value)}
                className="bg-secondary border-border text-foreground h-12 rounded-xl"
                placeholder="........"
                required
              />
            </div>
            {brokerError && (
              <p className="text-sm text-destructive text-center">{brokerError}</p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="trading-ghost"
                className="flex-1 h-12 rounded-xl"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Depois
              </Button>
              <Button variant="trading" className="flex-1 h-12 rounded-xl" disabled={brokerLoading}>
                {brokerLoading ? "Conectando..." : "Conectar"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Usuário</label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    className="bg-secondary border-border text-foreground h-12 rounded-xl"
                    placeholder="seu_usuario"
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-z0-9_]{3,30}"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Nome</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-secondary border-border text-foreground h-12 rounded-xl"
                    placeholder="Seu nome"
                  />
                </div>
              </>
            )}
            {mode === "signup" ? (
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-secondary border-border text-foreground h-12 rounded-xl"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Usuário</label>
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(normalizeUsername(e.target.value))}
                  className="bg-secondary border-border text-foreground h-12 rounded-xl"
                  placeholder="seu_usuario"
                  required
                  minLength={3}
                  maxLength={30}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Senha</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary border-border text-foreground h-12 rounded-xl"
                placeholder="........"
                required
                minLength={6}
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
                onClick={resetAndClose}
              >
                Cancelar
              </Button>
              <Button variant="trading" className="flex-1 h-12 rounded-xl" disabled={loading}>
                {loading ? "Entrando..." : mode === "signup" ? "Cadastrar" : "Entrar"}
              </Button>
            </div>
            <div className="border-t border-border pt-4 text-center">
              {mode === "login" ? (
                <>
                  <span className="text-sm text-muted-foreground">Não tem uma conta? </span>
                  <button type="button" onClick={() => setMode("signup")} className="text-sm text-primary hover:underline">
                    Cadastre-se
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">Já tem uma conta? </span>
                  <button type="button" onClick={() => setMode("login")} className="text-sm text-primary hover:underline">
                    Fazer login
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
