import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthToken } from "../api/client";

type AuthContextValue = {
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "price-tracker-token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = Boolean(token);

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post("/auth", { username, password });
      const newToken = response.data?.token;
      if (!newToken) {
        throw new Error("Token ausente");
      }
      setToken(newToken);
      setAuthToken(newToken);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Falha no login");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setAuthToken(null);
  };

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const value = useMemo(() => ({
    isAuthenticated,
    token,
    loading,
    error,
    login,
    logout
  }), [isAuthenticated, token, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
