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
      <div className="p-6 max-w-7xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Overview of exams, students, and alerts</p>
          </div>
          <Link href="/admin/exams/create" className="btn-primary inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Exam
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <span className="text-xs text-slate-400">Total</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{totalExams}</p>
              <p className="text-xs text-slate-500 mt-1">Exams created</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900">{totalStudents}</p>
              <p className="text-xs text-slate-500 mt-1">Students with alerts</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${pendingAlerts > 0 ? "bg-amber-100" : "bg-slate-100"}`}>
                  <svg className={`w-5 h-5 ${pendingAlerts > 0 ? "text-amber-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                {pendingAlerts > 0 && (
                  <span className="status-badge status-badge--warning">Pending</span>
                )}
              </div>
              <p className="text-3xl font-bold text-slate-900">{pendingAlerts}</p>
              <p className="text-xs text-slate-500 mt-1">Unreviewed alerts</p>
            </div>

            <div className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${highAlerts > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                  <svg className={`w-5 h-5 ${highAlerts > 0 ? "text-red-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                {highAlerts > 0 && (
                  <span className="status-badge status-badge--danger">{highAlerts}</span>
                )}
              </div>
              <p className="text-3xl font-bold text-slate-900">{highAlerts}</p>
              <p className="text-xs text-slate-500 mt-1">High severity</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/exams" className="btn-secondary text-sm !py-2.5">Manage Exams</Link>
          <Link
            href="/admin/reports"
            className={`text-sm !py-2.5 inline-flex items-center gap-2 ${
              pendingAlerts > 0 ? "btn-primary" : "btn-secondary"
            }`}
          >
            View Reports
            {pendingAlerts > 0 && (
              <span className="bg-white/20 text-white text-xs rounded-full px-2 py-0.5">{pendingAlerts}</span>
            )}
          </Link>
        </div>

        <div className="content-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Alerts</h2>
            {alerts.length > 0 && (
              <Link href="/admin/reports" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                View all
              </Link>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-lg" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">No alerts yet</p>
              <p className="text-xs text-slate-400 mt-1">Alerts appear when suspicious behavior is detected during exams.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((a: any) => (
                <Link
                  key={a.id}
                  href={`/admin/sessions/${a.session_id}`}
                  className="block p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 card-hover"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        a.severity === "high" ? "bg-red-500" :
                        a.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
                      }`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            a.severity === "high" ? "bg-red-100 text-red-700" :
                            a.severity === "medium" ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {a.severity}
                          </span>
                          <span className="text-sm font-medium text-slate-900 truncate">{a.student_name}</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{a.exam_title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs font-semibold text-slate-700">{Math.round(a.suspicion_score)}%</span>
                      {!a.reviewed && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">New</span>
                      )}
                    </div>
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
