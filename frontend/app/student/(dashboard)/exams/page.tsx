"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import { useAuth } from "@/src/contexts/AuthContext";

export default function StudentExamsPage() {
  const { user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.myExams(), api.mySessions()])
      .then(([e, s]) => {
        setExams(e);
        setSessions(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

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
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Available Examinations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Register for upcoming proctored tests or launch active exam sessions
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary self-start sm:self-auto">
            {exams.length} Total Exams
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-card rounded-2xl border border-border/80 animate-pulse" />
            ))}
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-card border border-border/80 rounded-2xl text-center p-12 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <span className="material-symbols-outlined text-3xl">quiz</span>
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">No Available Exams</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              There are currently no active or upcoming exams assigned to your profile. Please check back later.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => {
              const session = getSessionForExam(exam.id);
              const started = hasStarted(exam);
              return (
                <div
                  key={exam.id}
                  className="bg-card border border-border/80 hover:border-primary/50 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <h3 className="text-base sm:text-lg font-bold text-foreground truncate">{exam.title}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/50">
                          <span className="material-symbols-outlined text-sm text-primary">help</span>
                          {exam.questions?.length || 0} Questions
                        </span>
                        <span className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/50">
                          <span className="material-symbols-outlined text-sm text-blue-500">schedule</span>
                          {exam.duration_min} Minutes
                        </span>
                        <span className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border/50">
                          <span className="material-symbols-outlined text-sm text-emerald-500">event</span>
                          {new Date(exam.start_time).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {!session ? (
                        <button
                          onClick={() => handleRegister(exam.id)}
                          className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-primary/20 flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">how_to_reg</span>
                          <span>Register Exam</span>
                        </button>
                      ) : session.status === "registered" && started ? (
                        <Link
                          href={`/student/exams/${exam.id}`}
                          className="px-5 py-2.5 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-500 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-primary/20 flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                          <span>Start Exam</span>
                        </Link>
                      ) : session.status === "in_progress" ? (
                        <Link
                          href={`/student/exams/${exam.id}`}
                          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-base">resume</span>
                          <span>Continue Session</span>
                        </Link>
                      ) : session.status === "submitted" ? (
                        <Link
                          href={`/student/results?session=${session.id}`}
                          className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl text-xs transition border border-border flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-base">assessment</span>
                          <span>View Results</span>
                        </Link>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold capitalize">
                          {session.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {!started && (
                    <div className="pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      <span>Exam opens on {new Date(exam.start_time).toLocaleString()}</span>
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
