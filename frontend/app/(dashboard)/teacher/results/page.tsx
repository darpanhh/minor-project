"use client";

import { Button } from "@/components/ui/button";

const students = [
  { name: "Julianne Smith", id: "44920", score: 94.5, status: "passed", integrity: 99 },
  { name: "Marcus Porter", id: "44811", score: 82.0, status: "passed", integrity: 96 },
  { name: "Ethan Davies", id: "45002", score: 42.0, status: "failed", integrity: 41 },
  { name: "Sarah Chen", id: "44775", score: 75.5, status: "passed", integrity: 92 },
];

export default function TeacherResultsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Results Overview</h2>
        <p className="text-muted-foreground">Advanced Algorithms 101 - Final Examination</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground uppercase mb-1">Average Score</p>
          <p className="text-2xl font-bold">78.4</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground uppercase mb-1">Highest</p>
          <p className="text-2xl font-bold">98.0</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground uppercase mb-1">Lowest</p>
          <p className="text-2xl font-bold">42.0</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border ring-1 ring-destructive/20">
          <p className="text-xs text-destructive uppercase mb-1">Flags</p>
          <p className="text-2xl font-bold text-destructive">12</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Student Performance List</h3>
          <input className="w-64 p-2 border border-input rounded-lg text-sm bg-background" placeholder="Search students..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase bg-muted/50">
                <th className="p-3">Student Name</th>
                <th className="p-3 text-center">Score</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">AI Integrity</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {s.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {s.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-primary">{s.score}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.status === "passed" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                    }`}>{s.status.toUpperCase()}</span>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
                      <span className="text-sm font-semibold">{s.integrity}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <button className="text-sm text-primary hover:underline">Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
