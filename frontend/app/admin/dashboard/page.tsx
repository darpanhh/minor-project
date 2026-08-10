"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

export default function AdminDashboard() {
  const [exams, setExams] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listExams(),
      api.listAlerts().catch(() => []),
      api.listAllSessions().catch(() => []),
    ])
      .then(([e, a]) => {
        setExams(e);
        setAlerts(a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalExams = exams.length;
  const pendingAlerts = alerts.filter((a) => !a.reviewed).length;
  const highAlerts = alerts.filter((a) => a.severity === "high").length;
  const totalStudents = [...new Set(alerts.map((a) => a.student_name))].length;

  return (
    <ProtectedRoute role="admin">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">Admin & Proctoring Command Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live monitoring, suspicion audit reports, and examination management
            </p>
          </div>
          <Link
            href="/admin/exams/create"
            className="px-5 py-2.5 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-primary/20 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            <span>Create New Exam</span>
          </Link>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-card rounded-2xl border border-border/80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">assignment</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{totalExams}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Exams Created</p>
            </div>

            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">group</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{totalStudents}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Students Audited</p>
            </div>

            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">pending</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{pendingAlerts}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Pending Audit Alerts</p>
            </div>

            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">warning</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{highAlerts}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">High Severity Alerts</p>
            </div>
          </div>
        )}

        {/* Quick Action Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/exams"
            className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl text-xs transition border border-border flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">library_books</span>
            <span>Manage All Exams</span>
          </Link>
          <Link
            href="/admin/reports"
            className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-primary/20 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">assessment</span>
            <span>View Full Audit Reports ({pendingAlerts})</span>
          </Link>
        </div>

        {/* Recent Alerts List */}
        <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Real-Time Proctoring Flags & Alerts</h2>
              <p className="text-xs text-muted-foreground">Automated suspicious activity detection output</p>
            </div>
            {alerts.length > 0 && (
              <Link href="/admin/reports" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <span>View All Reports</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-xl">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-2xl">check_circle</span>
              </div>
              <p className="text-sm font-bold text-foreground">No Suspicious Activity Detected</p>
              <p className="text-xs text-muted-foreground mt-1">All active examination sessions are clean and compliant.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 5).map((a: any) => (
                <Link
                  key={a.id}
                  href={`/admin/sessions/${a.session_id}`}
                  className="flex items-center justify-between p-4 rounded-xl border border-border/70 bg-background/50 hover:bg-muted/30 hover:border-primary/40 transition-all gap-4 group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        a.severity === "high"
                          ? "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                          : a.severity === "medium"
                          ? "bg-amber-500"
                          : "bg-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            a.severity === "high"
                              ? "bg-destructive/10 text-destructive border border-destructive/20"
                              : a.severity === "medium"
                              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {a.severity}
                        </span>
                        <span className="text-sm font-bold text-foreground truncate">{a.student_name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{a.exam_title}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-extrabold text-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
                      {Math.round(a.suspicion_score)}% Score
                    </span>
                    <span className="material-symbols-outlined text-muted-foreground group-hover:text-primary transition-colors text-base">
                      chevron_right
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
