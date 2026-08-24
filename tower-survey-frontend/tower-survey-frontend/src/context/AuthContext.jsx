import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ti_user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (matricule, password) => {
    const data = await api.login(matricule, password);
    localStorage.setItem("ti_token", data.token);
    localStorage.setItem("ti_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ti_token");
    localStorage.removeItem("ti_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
