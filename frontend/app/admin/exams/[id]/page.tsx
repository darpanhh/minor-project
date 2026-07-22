"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

export default function AdminExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getExam(id)
      .then(setExam)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ProtectedRoute role="admin">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="skeleton h-6 w-32 mb-6" />
          <div className="skeleton h-8 w-64 mb-2" />
          <div className="skeleton h-4 w-48 mb-8" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!exam) {
    return (
      <ProtectedRoute role="admin">
        <div className="p-6 text-center">
          <p className="text-red-600">Exam not found</p>
          <Link href="/admin/exams" className="text-indigo-600 hover:underline text-sm mt-2 inline-block">Back to exams</Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute role="admin">
      <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <Link href="/admin/exams" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Exams
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{exam.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                {exam.questions?.length || 0} questions
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {exam.duration_min} minutes
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5z" />
                </svg>
                {new Date(exam.start_time).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="content-card mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Questions</h2>
          <div className="space-y-4">
            {exam.questions?.map((q: any, i: number) => (
              <div key={i} className="border border-slate-200 rounded-xl p-5">
                <p className="font-medium text-slate-900 mb-3">
                  {i + 1}. {q.question}
                </p>
                <div className="space-y-1.5 ml-2">
                  {q.options?.map((opt: string, oi: number) => (
                    <div
                      key={oi}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        oi === q.correct_answer
                          ? "bg-emerald-50 border border-emerald-200"
                          : "text-slate-600"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                        oi === q.correct_answer ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                      }`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className={oi === q.correct_answer ? "text-emerald-800 font-medium" : ""}>
                        {opt}
                      </span>
                      {oi === q.correct_answer && (
                        <svg className="w-4 h-4 text-emerald-500 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="content-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Student Sessions ({exam.sessions?.length || 0})
            </h2>
          </div>
          {exam.sessions?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Score</th>
                    <th className="py-3" />
                  </tr>
                </thead>
                <tbody>
                  {exam.sessions.map((s: any) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.student_name || "Unknown"}</p>
                          {s.student_email && <p className="text-xs text-slate-400">{s.student_email}</p>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`status-badge ${
                          s.status === "submitted" ? "status-badge--success" :
                          s.status === "in_progress" ? "status-badge--info" :
                          s.status === "flagged" ? "status-badge--danger" :
                          "status-badge--default"
                        }`}>{s.status}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`text-sm font-semibold ${
                          s.score != null && s.score >= 60 ? "text-emerald-600" :
                          s.score != null && s.score >= 40 ? "text-amber-600" :
                          s.score != null ? "text-red-600" : "text-slate-400"
                        }`}>
                          {s.score != null ? `${Math.round(s.score)}%` : "\u2014"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
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
          ) : (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">No students registered yet</p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
