"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/student/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/student/exams", label: "Exams", icon: "quiz" },
  { href: "/student/results", label: "Results", icon: "analytics" },
  { href: "/teacher/dashboard", label: "Teacher", icon: "school" },
  { href: "/teacher/exams", label: "Manage Exams", icon: "edit_note" },
  { href: "/teacher/suspicious", label: "Flags", icon: "report" },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-surface border-r border-border h-[calc(100vh-4rem)] sticky top-16">
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span className="material-symbols-outlined text-lg">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            VP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Demo User</p>
            <p className="text-xs text-muted-foreground">Student</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
