"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

export default function StudentExamsPage() {
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

  function getSessionForExam(examId: string) {
    return sessions.find((s) => s.exam_id === examId);
  }

  async function handleRegister(examId: string) {
    try {
      await api.registerForExam(examId);
      const updated = await api.mySessions();
      setSessions(updated);
    } catch (err: any) {
      alert(err.message);
    }
  }

  const hasStarted = (exam: any) => new Date(exam.start_time) <= new Date();

  return (
    <ProtectedRoute role="student">
      <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Available Exams</h1>
          <p className="text-sm text-slate-500 mt-1">{exams.length} exam{exams.length !== 1 ? "s" : ""} available</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
        ) : exams.length === 0 ? (
          <div className="content-card text-center py-12">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No exams available</h3>
            <p className="text-sm text-slate-500">Check back later for upcoming exams.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exams.map((exam, idx) => {
              const session = getSessionForExam(exam.id);
              const started = hasStarted(exam);
              return (
                <div
                  key={exam.id}
                  className="content-card card-hover animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-900">{exam.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                          </svg>
                          {exam.questions?.length || 0} questions
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {exam.duration_min} min
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5z" />
                          </svg>
                          {new Date(exam.start_time).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!session ? (
                        <button
                          onClick={() => handleRegister(exam.id)}
                          className="btn-primary text-sm !py-2 !px-4"
                        >
                          Register
                        </button>
                      ) : session.status === "registered" && started ? (
                        <Link
                          href={`/student/exams/${exam.id}`}
                          className="btn-primary text-sm !py-2 !px-4"
                        >
                          Start Exam
                        </Link>
                      ) : session.status === "in_progress" ? (
                        <Link
                          href={`/student/exams/${exam.id}`}
                          className="btn-primary text-sm !py-2 !px-4"
                        >
                          Continue
                        </Link>
                      ) : session.status === "submitted" ? (
                        <Link
                          href={`/student/results?session=${session.id}`}
                          className="btn-secondary text-sm !py-2 !px-4"
                        >
                          View Result
                        </Link>
                      ) : (
                        <span className="status-badge status-badge--default">{session.status}</span>
                      )}
                    </div>
                  </div>
                  {!started && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Starts {new Date(exam.start_time).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
