"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <header className="bg-card/80 backdrop-blur-xl border-b border-border/80 w-full top-0 sticky z-50 transition-all duration-200">
      <div className="flex items-center justify-between px-4 md:px-6 h-16 w-full max-w-full">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center text-white shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
            <span className="material-symbols-outlined text-xl">visibility</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-1.5 leading-tight">
              Vision<span className="text-primary font-black">Proctor</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                AI
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">Real-time Intelligent Assessment Guardian</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 bg-muted/60 border border-border px-3 py-1 rounded-full text-xs font-medium text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Detector Ready</span>
          </div>

          {user && (
            <>
              <div className="flex items-center gap-3 pl-2 border-l border-border/80">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shadow-sm">
                  {user.full_name?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="hidden md:block">
                  <p className="text-xs font-semibold text-foreground leading-snug">{user.full_name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{user.role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                <span className="hidden sm:inline text-xs font-semibold">Sign Out</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
