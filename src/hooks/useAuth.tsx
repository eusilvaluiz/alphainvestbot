import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { alphaApi, type UserSession } from "@/lib/api";
import type { User, Session } from "@supabase/supabase-js";

interface BrokerCredentials {
  broker_user: string;
  broker_token: string | null;
  ws_token: string | null;
  credit: string | null;
  credit_cents: number;
}

interface AuthContextType {
  // Supabase auth
  user: User | null;
  session: Session | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Broker connection
  brokerSession: UserSession | null;
  isBrokerConnected: boolean;
  connectBroker: (user: string, pass: string) => Promise<void>;
  disconnectBroker: () => void;
  brokerLoading: boolean;
  brokerError: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Broker state
  const [brokerSession, setBrokerSession] = useState<UserSession | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // When user logs in, try to restore broker session
        if (session?.user && event === "SIGNED_IN") {
          setTimeout(() => restoreBrokerSession(session.user.id), 0);
        }
        if (event === "SIGNED_OUT") {
          setBrokerSession(null);
          alphaApi.logout();
        }
      }
    );

    // THEN get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        restoreBrokerSession(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const restoreBrokerSession = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("broker_credentials")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (data?.broker_token) {
        // Restore the API session from saved credentials
        const restored: UserSession = {
          accessToken: data.broker_token,
          wsToken: data.ws_token || "",
          user: data.broker_user,
          credit: data.credit || "0",
          creditCents: data.credit_cents || 0,
        };
        alphaApi.restoreSession(restored);
        setBrokerSession(restored);
      }
    } catch {
      // No saved credentials, that's OK
    }
  };

  const signUp = async (email: string, password: string, name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name || email } },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message || "Erro ao cadastrar");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message || "Erro ao fazer login");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setBrokerSession(null);
    alphaApi.logout();
  };

  const connectBroker = async (brokerUser: string, brokerPass: string) => {
    if (!user) throw new Error("Faça login primeiro");
    setBrokerLoading(true);
    setBrokerError(null);
    try {
      const s = await alphaApi.login(brokerUser, brokerPass);
      setBrokerSession(s);

      // Save/update broker credentials in database
      const { data: existing } = await supabase
        .from("broker_credentials")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (existing) {
        await supabase
          .from("broker_credentials")
          .update({
            broker_user: brokerUser,
            broker_token: s.accessToken,
            ws_token: s.wsToken,
            credit: s.credit,
            credit_cents: s.creditCents,
          })
          .eq("user_id", user.id);
      } else {
        await supabase.from("broker_credentials").insert({
          user_id: user.id,
          broker_user: brokerUser,
          broker_token: s.accessToken,
          ws_token: s.wsToken,
          credit: s.credit,
          credit_cents: s.creditCents,
        });
      }
    } catch (e: any) {
      setBrokerError(e.message || "Erro ao conectar corretora");
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
        signUp,
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
