"use client";

import Link from "next/link";
import { useAuth } from "@/src/contexts/AuthContext";

const roleNavItems: Record<string, { href: string; label: string; icon: string }[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/exams", label: "Exams", icon: "quiz" },
    { href: "/admin/reports", label: "Reports", icon: "assessment" },
  ],
  teacher: [
    { href: "/teacher/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/teacher/exams", label: "Exams", icon: "quiz" },
    { href: "/teacher/results", label: "Results", icon: "analytics" },
    { href: "/teacher/suspicious", label: "Flags", icon: "report_problem" },
  ],
  student: [
    { href: "/student/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/student/exams", label: "Exams", icon: "quiz" },
    { href: "/student/results", label: "Results", icon: "analytics" },
  ],
};

export function BottomNav() {
  const { user } = useAuth();
  const navItems = roleNavItems[user?.role || "student"] || roleNavItems.student;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-2 bg-surface border-t border-border h-16">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center justify-center text-muted-foreground px-2 py-1"
        >
          <span className="material-symbols-outlined text-lg">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}