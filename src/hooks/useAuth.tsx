import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { alphaApi, type UserSession } from "@/lib/api";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  brokerSession: UserSession | null;
  isBrokerConnected: boolean;
  connectBroker: (user: string, pass: string) => Promise<void>;
  disconnectBroker: () => void;
  brokerLoading: boolean;
  brokerError: string | null;
}

interface BrokerAuthPayload {
  error?: string;
  session?: {
    access_token: string;
    refresh_token: string;
  };
  brokerSession?: UserSession;
}

const AuthContext = createContext<AuthContextType | null>(null);

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokerSession, setBrokerSession] = useState<UserSession | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);

  useEffect(() => {
    const applyAuthState = (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (nextSession?.user) {
        void restoreBrokerSession(nextSession.user.id);
        return;
      }

      const hasLocalBrokerCredentials = !!localStorage.getItem("broker_credentials");
      const hasLocalBrokerSession = !!localStorage.getItem("alpha_session");

      if (hasLocalBrokerCredentials || hasLocalBrokerSession) {
        return;
      }

      setBrokerSession(null);
      alphaApi.logout();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applyAuthState(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applyAuthState(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const restoreBrokerSession = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("broker_credentials")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data?.broker_token) {
        setBrokerSession(null);
        alphaApi.logout();
        return;
      }

      const restored: UserSession = {
        accessToken: data.broker_token,
        wsToken: data.ws_token || "",
        userId: 0,
        login: data.broker_user,
        name: data.broker_user,
        credit: data.credit || "0",
        creditCents: data.credit_cents || 0,
      };

      alphaApi.restoreSession(restored);
      setBrokerSession(restored);
    } catch {
      setBrokerSession(null);
      alphaApi.logout();
    }
  };

  const authenticateWithBroker = async (username: string, password: string) => {
    const normalizedUsername = normalizeUsername(username);

    if (normalizedUsername.length < 3) {
      throw new Error("Informe um usuário válido");
    }

    if (!password.trim()) {
      throw new Error("Informe a senha");
    }

    const { data, error } = await supabase.functions.invoke("unic-auth", {
      body: {
        user: normalizedUsername,
        pass: password,
      },
    });

    if (error) {
      throw new Error(error.message || "Erro ao autenticar");
    }

    const payload = data as BrokerAuthPayload | null;

    if (payload?.error) {
      throw new Error(payload.error);
    }

    if (!payload?.session?.access_token || !payload?.session?.refresh_token || !payload?.brokerSession) {
      throw new Error("Não foi possível iniciar a sessão");
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
    });

    if (sessionError) throw sessionError;

    setSession(sessionData.session);
    setUser(sessionData.user ?? sessionData.session?.user ?? null);
    alphaApi.restoreSession(payload.brokerSession);
    setBrokerSession(payload.brokerSession);
  };

  const signIn = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    setBrokerError(null);

    try {
      await authenticateWithBroker(username, password);
      // Store broker credentials for chart UDF access
      localStorage.setItem("broker_credentials", JSON.stringify({ user: username, pass: password }));
    } catch (e: any) {
      const message = e?.message || "Erro ao fazer login";
      setError(message);
      setBrokerError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setBrokerSession(null);
    alphaApi.logout();
    localStorage.removeItem("broker_credentials");
  };

  const connectBroker = async (brokerUser: string, brokerPass: string) => {
    setBrokerLoading(true);
    setBrokerError(null);

    try {
      await authenticateWithBroker(brokerUser, brokerPass);
    } catch (e: any) {
      const message = e?.message || "Erro ao conectar corretora";
      setBrokerError(message);
      throw e;
    } finally {
      setBrokerLoading(false);
    }
  };

  const disconnectBroker = () => {
    alphaApi.logout();
    setBrokerSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoggedIn: !!user,
        loading,
        error,
        signIn,
        signOut,
        brokerSession,
        isBrokerConnected: !!brokerSession,
        connectBroker,
        disconnectBroker,
        brokerLoading,
        brokerError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
