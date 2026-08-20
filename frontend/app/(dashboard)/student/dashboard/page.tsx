"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import { useAuth } from "@/src/contexts/AuthContext";

export default function StudentDashboard() {
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

  const availableExams = exams.length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;
  const completed = sessions.filter((s) => s.status === "submitted").length;
  const reviewedSessions = sessions.filter((s) => s.result_status === "reviewed" && s.final_score != null);
  const avgScore = reviewedSessions.reduce((a, b) => a + (b.final_score || 0), 0);
  const avgScoreDisplay = reviewedSessions.length > 0
    ? Math.round(avgScore / reviewedSessions.length)
    : null;

  return (
    <ProtectedRoute role="student">
      <div className="space-y-8 animate-fade-in">
        {/* Welcome Banner */}
        

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-card rounded-2xl border border-border/80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">assignment</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{availableExams}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Available Exams</p>
            </div>

            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">pending_actions</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{inProgress}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">In Progress</p>
            </div>

            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-xl">verified</span>
              </div>
              <p className="text-3xl font-extrabold text-foreground">{completed}</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Completed Sessions</p>
            </div>

  
          </div>
        )}

        {/* Recent Sessions List */}
        <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Recent Exam Sessions</h2>
              <p className="text-xs text-muted-foreground">Monitor ongoing exams or view completed session scores</p>
            </div>
            {sessions.length > 0 && (
              <Link href="/student/exams" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <span>View All</span>
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
          ) : sessions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-xl">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                <span className="material-symbols-outlined text-2xl">quiz</span>
              </div>
              <p className="text-sm font-semibold text-foreground">No Exam Sessions Yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Register for an available exam to begin your session.</p>
              <Link href="/student/exams" className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-medium inline-flex items-center gap-1">
                Browse Exams
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.slice(0, 5).map((s) => {
                const exam = exams.find((e) => e.id === s.exam_id);
                return (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/70 bg-background/50 hover:bg-muted/30 hover:border-primary/40 transition-all gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-foreground">{exam?.title || "Examination"}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                            s.status === "submitted"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : s.status === "in_progress"
                              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {s.status.replace("_", " ")}
                        </span>
                        {s.status === "submitted" && (
                          s.result_status === "reviewed" && s.final_score != null ? (
                            <span className="text-xs font-extrabold text-foreground">Score: {Math.round(s.final_score)}%</span>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">Result will be published by admin</span>
                          )
                        )}
                      </div>
                    </div>

                    <div>
                      {s.status === "submitted" ? (
                        <Link
                          href={`/student/results?session=${s.id}`}
                          className="px-3.5 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg transition inline-flex items-center gap-1"
                        >
                          <span>View Result</span>
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </Link>
                      ) : s.status === "in_progress" ? (
                        <Link
                          href={`/student/exams/${s.exam_id}`}
                          className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                        >
                          <span>Resume Exam</span>
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </Link>
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
