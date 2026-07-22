"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/exams", label: "Exams" },
    { href: "/admin/reports", label: "Reports" },
  ];

  const studentLinks = [
    { href: "/student/dashboard", label: "Dashboard" },
    { href: "/student/exams", label: "Exams" },
  ];

  const links = user?.role === "admin" ? adminLinks : user?.role === "student" ? studentLinks : [];

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold transition-transform group-hover:scale-105">
              V
            </div>
            <span className="font-semibold text-lg tracking-tight text-slate-900">
              Vision<span className="text-indigo-600">Proctor</span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {user ? (
              <div className="flex items-center gap-3 ml-3 pl-3 border-l border-slate-200">
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-700 font-medium max-w-[120px] truncate">
                    {user.full_name}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="text-sm text-slate-500 hover:text-red-600 font-medium transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-200">
                <Link
                  href="/login"
                  className="btn-secondary text-sm !py-2 !px-4"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="btn-primary !py-2 !px-4 text-sm"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
