import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { alphaApi, type UserSession } from "@/lib/api";

interface AuthContextType {
  session: UserSession | null;
  isLoggedIn: boolean;
  login: (user: string, pass: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = alphaApi.getSession();
    if (existing) setSession(existing);
  }, []);

  const login = async (user: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const s = await alphaApi.login(user, pass);
      setSession(s);
    } catch (e: any) {
      setError(e.message || "Erro ao fazer login");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    alphaApi.logout();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoggedIn: !!session, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
