"use client";

const flags = [
  { id: "f1", student: "Ethan Davies", type: "Tab Switching", severity: "critical", time: "14:23:05", description: "Switched tabs 5 times in 2 minutes" },
  { id: "f2", student: "Maria Lopez", type: "Multiple Persons", severity: "warning", time: "14:15:30", description: "Second face detected in frame" },
  { id: "f3", student: "John Kim", type: "Looking Away", severity: "warning", time: "14:10:00", description: "Gaze away for 15+ seconds" },
  { id: "f4", student: "Anna White", type: "Phone Detected", severity: "critical", time: "14:05:00", description: "Mobile device detected in frame" },
];

export default function SuspiciousPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Suspicious Activity</h2>
        <p className="text-muted-foreground">Review flagged exam sessions</p>
      </div>

      <div className="space-y-3">
        {flags.map((flag) => (
          <div key={flag.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                flag.severity === "critical" ? "bg-destructive/10" : "bg-warning/10"
              }`}>
                <span className={`material-symbols-outlined ${
                  flag.severity === "critical" ? "text-destructive" : "text-amber-500"
                }`}>warning</span>
              </div>
              <div>
                <p className="font-medium">{flag.student}</p>
                <p className="text-sm text-muted-foreground">{flag.type} · {flag.time}</p>
                <p className="text-xs text-muted-foreground">{flag.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                flag.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-600"
              }`}>
                {flag.severity}
              </span>
              <button className="text-sm text-primary hover:underline">Review</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
