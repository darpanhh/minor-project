"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import { useAuth } from "@/src/contexts/AuthContext";

const statusColor = (s: string) => {
  switch (s) {
    case "submitted": return "status-badge--success";
    case "in_progress": return "status-badge--info";
    case "registered": return "status-badge--default";
    default: return "status-badge--default";
  }
};

export default function AdminSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.listAllSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <ProtectedRoute role="admin">
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Exam Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="content-card text-center py-16">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No sessions</h3>
            <p className="text-sm text-slate-500">No exam sessions recorded yet.</p>
          </div>
        ) : (
          <div className="content-card overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Exam</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Violations</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Final Score</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Result</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="py-3.5 px-5" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s: any, idx: number) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ animationDelay: `${idx * 0.03}s` }}>
                      <td className="py-3.5 px-5">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.student_name}</p>
                          <p className="text-xs text-slate-500">{s.student_email}</p>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-sm text-slate-700 font-medium">
                        {s.exam_title || "Exam"}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`status-badge ${statusColor(s.status)}`}>{s.status.replace(/_/g, " ")}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        {s.event_count !== undefined && s.event_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {s.event_count} ({s.snapshot_count || 0} snap)
                          </span>
                        ) : s.status === "registered" ? (
                          <span className="text-xs text-slate-400 italic">Not started</span>
                        ) : (
                          <span className="text-xs text-emerald-600 font-medium">Clean</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-sm text-slate-700 font-bold">
                        {s.final_score != null ? `${Math.round(s.final_score)}%` : "—"}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-xs font-medium ${s.result_status === "reviewed" ? "text-emerald-600" : "text-amber-600"}`}>
                          {s.result_status?.replace(/_/g, " ") || "pending"}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-400">
                        {s.submitted_at
                          ? new Date(s.submitted_at).toLocaleDateString()
                          : s.started_at
                          ? new Date(s.started_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          href={`/admin/sessions/${s.id}`}
                          className="btn-ghost text-xs !py-1.5"
                        >
                          View Report
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
