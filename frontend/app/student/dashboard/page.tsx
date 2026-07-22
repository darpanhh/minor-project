"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

export default function StudentDashboard() {
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.myExams(), api.mySessions()])
      .then(([e, s]) => {
        setExams(e);
        setSessions(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const availableExams = exams.length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;
  const completed = sessions.filter((s) => s.status === "submitted").length;
  const avgScore = sessions.filter((s) => s.score != null).reduce((a, b) => a + (b.score || 0), 0);
  const avgScoreDisplay = sessions.filter((s) => s.score != null).length > 0
    ? Math.round(avgScore / sessions.filter((s) => s.score != null).length)
    : null;

  return (
    <ProtectedRoute role="student">
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Student Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Track your exams and performance</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
              <div className="stat-card">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <p className="text-3xl font-bold text-slate-900">{availableExams}</p>
                <p className="text-xs text-slate-500 mt-1">Available exams</p>
              </div>
              <div className="stat-card">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-3xl font-bold text-slate-900">{inProgress}</p>
                <p className="text-xs text-slate-500 mt-1">In progress</p>
              </div>
              <div className="stat-card">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-3xl font-bold text-slate-900">{completed}</p>
                <p className="text-xs text-slate-500 mt-1">Completed</p>
              </div>
              <div className="stat-card">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <p className="text-3xl font-bold text-slate-900">{avgScoreDisplay ?? "\u2014"}</p>
                <p className="text-xs text-slate-500 mt-1">Avg score %</p>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <Link href="/student/exams" className="btn-primary text-sm inline-flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                View Exams
              </Link>
            </div>
          </>
        )}

        <div className="content-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Sessions</h2>
            {sessions.length > 0 && (
              <Link href="/student/exams" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">View all</Link>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500 mb-1">No sessions yet</p>
              <p className="text-xs text-slate-400">Register for an exam to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((s) => {
                const exam = exams.find((e) => e.id === s.exam_id);
                return (
                  <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 card-hover">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{exam?.title || "Exam"}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`status-badge ${
                          s.status === "submitted" ? "status-badge--success" :
                          s.status === "in_progress" ? "status-badge--info" : "status-badge--default"
                        }`}>{s.status}</span>
                        {s.score != null && (
                          <span className="text-xs font-semibold">{Math.round(s.score)}%</span>
                        )}
                      </div>
                    </div>
                    <div>
                      {s.status === "submitted" ? (
                        <Link href={`/student/results?session=${s.id}`} className="btn-ghost text-xs">View Result</Link>
                      ) : s.status === "in_progress" ? (
                        <Link href={`/student/exams/${s.exam_id}`} className="btn-primary text-xs !py-1.5 !px-3">Continue</Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
