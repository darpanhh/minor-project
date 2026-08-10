"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@/src/services/api";

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  student_id: string | null;
  registered_photo: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (full_name: string, email: string, password: string, student_id?: string, photo?: File) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => typeof window === "undefined" || !localStorage.getItem("access_token"));

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    api.setToken(token);
    api.me()
      .then((u) => setUser({ id: u.id, full_name: u.full_name, email: u.email, role: u.role, student_id: u.student_id, registered_photo: u.registered_photo }))
      .catch(() => { api.setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    api.setToken(res.access_token);
    setUser({ id: res.user.id, full_name: res.user.full_name, email: res.user.email, role: res.user.role, student_id: res.user.student_id, registered_photo: res.user.registered_photo });
  }

  async function register(full_name: string, email: string, password: string, student_id?: string, photo?: File) {
    await api.register({ full_name, email, password, student_id, photo });
  }

  function logout() {
    api.setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
