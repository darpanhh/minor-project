"use client";

const students = [
  { name: "Julianne Smith", id: "44920", score: 94.5, status: "passed", integrity: 99 },
  { name: "Marcus Porter", id: "44811", score: 82.0, status: "passed", integrity: 96 },
  { name: "Ethan Davies", id: "45002", score: 42.0, status: "failed", integrity: 41 },
  { name: "Sarah Chen", id: "44775", score: 75.5, status: "passed", integrity: 92 },
];

export default function TeacherDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">
          Analytics Overview
        </p>
        <h2 className="text-2xl font-bold">Advanced Algorithms 101</h2>
        <p className="text-muted-foreground">Final Examination Term - Spring 2024</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Average Score</span>
            <span className="material-symbols-outlined text-primary">analytics</span>
          </div>
          <p className="text-2xl font-bold">78.4</p>
          <p className="text-xs text-muted-foreground">+2.1% vs prev. term</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Highest Score</span>
            <span className="material-symbols-outlined text-primary">trending_up</span>
          </div>
          <p className="text-2xl font-bold">98.0</p>
          <p className="text-xs text-muted-foreground">Top 5% Performers</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Lowest Score</span>
            <span className="material-symbols-outlined text-destructive">trending_down</span>
          </div>
          <p className="text-2xl font-bold">42.0</p>
          <p className="text-xs text-muted-foreground">3 students at risk</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border ring-1 ring-destructive/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-destructive uppercase">Suspicious Flags</span>
            <span className="material-symbols-outlined text-destructive">report</span>
          </div>
          <p className="text-2xl font-bold text-destructive">12</p>
          <p className="text-xs text-muted-foreground">Review required</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold mb-4">Student Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase">
                <th className="pb-3 pr-4">Student</th>
                <th className="pb-3 pr-4 text-center">Score</th>
                <th className="pb-3 pr-4 text-center">Status</th>
                <th className="pb-3 pr-4 text-center">Integrity</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-muted/50 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {student.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{student.name}</p>
                        <p className="text-xs text-muted-foreground">ID: {student.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-center font-mono font-bold text-primary">
                    {student.score}
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        student.status === "passed"
                          ? "bg-primary/10 text-primary"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {student.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-sm text-primary">
                        verified_user
                      </span>
                      <span className="text-sm font-semibold">
                        {student.integrity}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <button className="text-sm text-primary hover:underline">
                      Details
                    </button>
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
