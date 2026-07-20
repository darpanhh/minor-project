"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" /></div>}>
      <ResultsContent />
    </Suspense>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [session, setSession] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    Promise.all([
      api.mySessionDetail(sessionId),
      api.getSessionEvents(sessionId).catch(() => []),
    ])
      .then(([s, ev]) => {
        setSession(s);
        setEvents(ev);
        return api.getExam(s.exam_id);
      })
      .then((e) => setExam(e))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <ProtectedRoute role="student"><div className="p-8 text-center">
    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
  </div></ProtectedRoute>;

  if (!session) {
    return (
      <ProtectedRoute role="student">
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Results</h1>
          <p className="text-slate-500 mb-4">No session selected.</p>
          <Link href="/student/exams" className="btn-secondary">View Exams</Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute role="student">
      <div className="p-6 max-w-2xl mx-auto animate-fade-in">
        <div className="text-center mb-8">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            session.score != null && session.score >= 60 ? "bg-emerald-100" :
            session.score != null ? "bg-red-100" : "bg-slate-100"
          }`}>
            <span className={`text-3xl font-bold ${
              session.score != null && session.score >= 60 ? "text-emerald-600" :
              session.score != null ? "text-red-600" : "text-slate-400"
            }`}>
              {session.score != null ? `${Math.round(session.score)}%` : "?"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{exam?.title || "Exam Results"}</h1>
          <p className={`text-sm font-medium ${
            session.status === "submitted" ? "text-emerald-600" : "text-amber-600"
          }`}>
            {session.status === "submitted" ? "Completed" : session.status}
          </p>
        </div>

        <div className="content-card space-y-4">
          {session.score != null && (
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-500">Your Score</span>
                <span className="font-semibold text-slate-900">{Math.round(session.score)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ${
                    session.score >= 60 ? "bg-emerald-500" :
                    session.score >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${session.score}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-slate-500">Status</p>
              <p className={`font-semibold mt-0.5 ${
                session.status === "submitted" ? "text-emerald-600" : "text-amber-600"
              }`}>{session.status}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-slate-500">Events</p>
              <p className="font-semibold text-slate-900 mt-0.5">{events.length}</p>
            </div>
          </div>

          {session.started_at && (
            <div className="text-xs text-slate-400 space-y-1 pt-2">
              <p>Started: {new Date(session.started_at).toLocaleString()}</p>
              {session.submitted_at && <p>Submitted: {new Date(session.submitted_at).toLocaleString()}</p>}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link href="/student/exams" className="btn-primary flex-1 text-center">Back to Exams</Link>
            <Link href="/student/dashboard" className="btn-secondary flex-1 text-center">Dashboard</Link>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
