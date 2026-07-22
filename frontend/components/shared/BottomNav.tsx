"use client";

const navItems = [
  { href: "/student/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/student/exams", label: "Exams", icon: "quiz" },
  { href: "/student/results", label: "Results", icon: "analytics" },
  { href: "/teacher/dashboard", label: "Teacher", icon: "school" },
];

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-2 bg-surface border-t border-border h-16">
      {navItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="flex flex-col items-center justify-center text-muted-foreground px-2 py-1"
        >
          <span className="material-symbols-outlined text-lg">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
