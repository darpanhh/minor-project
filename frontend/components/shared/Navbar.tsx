"use client";

export function Navbar() {
  return (
    <header className="bg-surface shadow-sm w-full top-0 sticky z-50">
      <div className="flex items-center justify-between px-4 h-16 w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">
            visibility
          </span>
          <h1 className="text-lg font-semibold text-primary tracking-tight">
            Vision Proctor
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="material-symbols-outlined p-1 rounded-full hover:bg-accent transition-colors">
            notifications
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border">
            <span className="text-sm font-semibold text-primary">VP</span>
          </div>
        </div>
      </div>
    </header>
  );
}
