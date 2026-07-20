"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import { useEffect, ReactNode } from "react";

export default function ProtectedRoute({ children, role }: { children: ReactNode; role?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/login");
    else if (role && user.role !== role) router.push("/");
  }, [user, loading, role, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  if (role && user.role !== role) return null;

  return <>{children}</>;
}
