"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

const severityColor = (s: string) => {
  switch (s) {
    case "high": return "status-badge--danger";
    case "medium": return "status-badge--warning";
    case "low": return "status-badge--default";
    default: return "status-badge--default";
  }
};

const scoreBarColor = (score: number) => {
  if (score >= 85) return "bg-red-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 30) return "bg-orange-400";
  return "bg-emerald-500";
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listAlerts()
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute role="admin">
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Suspicious Activity</h1>
          <p className="text-sm text-slate-500 mt-1">
            {reports.length} alert{reports.length !== 1 ? "s" : ""} recorded
            {reports.filter((r) => !r.reviewed).length > 0 && (
              <span className="text-amber-600 font-medium">
                {" "}\u00b7 {reports.filter((r) => !r.reviewed).length} unreviewed
              </span>
            )}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="content-card text-center py-16">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No alerts</h3>
            <p className="text-sm text-slate-500">No suspicious activity detected yet.</p>
          </div>
        ) : (
          <div className="content-card overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Exam</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Severity</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Score</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left py-3.5 px-5 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="py-3.5 px-5" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r: any, idx: number) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors" style={{ animationDelay: `${idx * 0.03}s` }}>
                      <td className="py-3.5 px-5">
                        <span className="text-sm font-medium text-slate-900">{r.student_name}</span>
                      </td>
                      <td className="py-3.5 px-5 text-sm text-slate-600">{r.exam_title}</td>
                      <td className="py-3.5 px-5">
                        <span className={`status-badge ${severityColor(r.severity)}`}>{r.severity}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3 max-w-[180px]">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${scoreBarColor(r.suspicion_score)}`}
                              style={{ width: `${Math.min(r.suspicion_score, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-slate-700 w-10 text-right">
                            {Math.round(r.suspicion_score)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-xs font-medium ${r.reviewed ? "text-emerald-600" : "text-amber-600"}`}>
                          {r.reviewed ? "Reviewed" : "Pending"}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-400">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          href={`/admin/sessions/${r.session_id}`}
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
