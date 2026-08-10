"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const studentItems = [
    { href: "/student/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/student/exams", label: "My Exams", icon: "assignment" },
    { href: "/student/results", label: "Results & History", icon: "analytics" },
  ];

  const teacherItems = [
    { href: "/teacher/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/teacher/exams", label: "Manage Exams", icon: "edit_document" },
    { href: "/teacher/exams/create", label: "Create Exam", icon: "add_circle" },
    { href: "/teacher/suspicious", label: "Flagged Sessions", icon: "report_problem" },
    { href: "/teacher/results", label: "Student Results", icon: "verified" },
  ];

  const adminItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: "admin_panel_settings" },
    { href: "/admin/exams", label: "Exams Portal", icon: "local_library" },
    { href: "/admin/reports", label: "Audit Reports", icon: "assessment" },
  ];

  const navItems =
    user?.role === "admin"
      ? adminItems
      : user?.role === "teacher"
      ? teacherItems
      : studentItems;

  return (
    <aside className="hidden md:flex flex-col w-64 bg-card/60 backdrop-blur-xl border-r border-border/80 h-[calc(100vh-4rem)] sticky top-16 transition-all duration-200">
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {user?.role ? `${user.role} Navigation` : "Menu"}
        </div>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-semibold"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-lg transition-transform group-hover:scale-110",
                  active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                )}
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-border/80 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 shadow-sm">
                {user.full_name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate text-foreground leading-tight">
                  {user.full_name}
                </p>
                <p className="text-xs text-muted-foreground capitalize truncate">
                  {user.role}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
