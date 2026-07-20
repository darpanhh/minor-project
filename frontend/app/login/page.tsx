"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import Link from "next/link";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-bold mx-auto mb-4">
            V
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="content-card space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-xs text-center text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
