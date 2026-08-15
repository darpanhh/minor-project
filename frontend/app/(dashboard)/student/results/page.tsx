"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import { useAuth } from "@/src/contexts/AuthContext";

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-xs text-muted-foreground">Loading examination results...</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const { user } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(() => !sessionId);

  useEffect(() => {
    if (!sessionId || !user) return;
    api
      .mySessionDetail(sessionId)
      .then((s) => {
        setSession(s);
        return api.getExam(s.exam_id);
      })
      .then((e) => setExam(e))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId, user]);

  if (loading) return (
    <ProtectedRoute role="student">
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-xs text-muted-foreground">Loading results...</p>
      </div>
    </ProtectedRoute>
  );

  if (!session) {
    return (
      <ProtectedRoute role="student">
        <div className="max-w-md mx-auto my-12 p-8 bg-card border border-border/80 rounded-2xl text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-muted-foreground mb-2">find_in_page</span>
          <h1 className="text-xl font-bold text-foreground mb-1">No Session Selected</h1>
          <p className="text-xs text-muted-foreground mb-6">Select an exam session from your dashboard to view verified results.</p>
          <Link href="/student/exams" className="btn-primary inline-flex">View Exams</Link>
        </div>
      </ProtectedRoute>
    );
  }

  const reviewed = session.result_status === "reviewed" && session.final_score != null;

  return (
    <ProtectedRoute role="student">
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {/* Score Header Card */}
        <div className="bg-card border border-border/80 rounded-2xl p-6 sm:p-8 text-center shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <div
              className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 border shadow-xl ${
                reviewed
                  ? session.final_score >= 60
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 shadow-emerald-500/10"
                    : "bg-destructive/10 border-destructive/30 text-destructive shadow-destructive/10"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              <span className="text-3xl font-extrabold tracking-tight">
                {reviewed ? `${Math.round(session.final_score)}%` : "?"}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">{exam?.title || "Examination Results"}</h1>
            <p className={`text-xs font-bold uppercase tracking-wider mt-1.5 ${reviewed ? "text-emerald-500" : "text-amber-500"}`}>
              {reviewed ? "Official Score Released" : "Session Under Review by Proctor"}
            </p>
          </div>
        </div>

        {!reviewed && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-4">
            <span className="material-symbols-outlined text-2xl text-amber-500 shrink-0">hourglass_top</span>
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-600">Verification Pending</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                An administrator is reviewing your proctoring log and snapshots. Your score will be released once verified.
              </p>
            </div>
          </div>
        )}

        {reviewed && (
          <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Overall Performance</span>
                <span className="text-foreground">{Math.round(session.final_score)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ${
                    session.final_score >= 60 ? "bg-emerald-500" : session.final_score >= 40 ? "bg-amber-500" : "bg-destructive"
                  }`}
                  style={{ width: `${session.final_score}%` }}
                />
              </div>
            </div>

            {session.admin_notes && (
              <div className="bg-muted/50 border border-border/60 rounded-xl p-4 text-xs">
                <p className="font-bold text-foreground mb-1">Administrator Remarks</p>
                <p className="text-muted-foreground leading-relaxed">{session.admin_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Proctoring Report Note — evidence is not shown to students;
            it is shared by the administrator only if they choose to release it */}
        <div className="bg-card border border-border/80 rounded-2xl p-5 flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-muted-foreground shrink-0">visibility_off</span>
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">Proctoring Report</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The proctoring log and evidence snapshots collected during your session are confidential
              and are shared by the administrator only if they release the report to you.
            </p>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="flex gap-3">
          <Link href="/student/exams" className="btn-primary flex-1">
            Back to Available Exams
          </Link>
          <Link href="/student/dashboard" className="btn-secondary flex-1">
            Student Dashboard
          </Link>
        </div>
      </div>
    </ProtectedRoute>
  );
}
