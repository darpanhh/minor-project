"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, serverUrl } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    tab_switch: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    multiple_faces: "bg-destructive/10 text-destructive border-destructive/20",
    person_absent: "bg-destructive/10 text-destructive border-destructive/20",
    identity_mismatch: "bg-destructive/10 text-destructive border-destructive/20",
    phone_detected: "bg-destructive/10 text-destructive border-destructive/20",
    object_detected: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    gaze_away: "bg-muted text-muted-foreground border-border",
    head_pose_abnormal: "bg-muted text-muted-foreground border-border",
  };

  const formattedTitle =
    type === "phone_detected"
      ? "Mobile Phone Detected"
      : type === "multiple_faces" || type === "multiple_persons"
      ? "Multiple Persons Detected"
      : type === "person_absent"
      ? "Person Absent / No Face"
      : type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${colors[type] || "bg-muted text-muted-foreground border-border"}`}>
      {formattedTitle}
    </span>
  );
}

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
  const [session, setSession] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(() => !sessionId);

  useEffect(() => {
    if (!sessionId) return;
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

        {/* Proctoring Log Card */}
        <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/80">
            <div>
              <h2 className="text-base font-bold text-foreground">Proctoring Log & Snapshots</h2>
              <p className="text-xs text-muted-foreground">Automated evidence collected during your session</p>
            </div>
            <span className="text-xs font-bold text-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
              {events.length} Events
            </span>
          </div>

          {events.length > 0 ? (
            <div className="space-y-4">
              {events.map((e: any) => (
                <div key={e.id} className="border border-border/70 rounded-xl p-4 bg-background/50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <EventBadge type={e.event_type} />
                    <span className="text-[11px] text-muted-foreground font-mono">{new Date(e.timestamp).toLocaleString()}</span>
                  </div>

                  {e.snapshot_path ? (
                    <a href={serverUrl(e.snapshot_path)} target="_blank" rel="noreferrer" className="block group">
                      <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={serverUrl(e.snapshot_path)}
                          alt={`${e.event_type.replace(/_/g, " ")} snapshot`}
                          className="w-full max-h-64 object-cover group-hover:scale-102 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition-opacity">
                          Click to View Full Resolution Evidence
                        </div>
                      </div>
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No image snapshot recorded for this event.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              <span className="material-symbols-outlined text-3xl text-emerald-500 mb-1">verified</span>
              <p className="font-semibold text-foreground">Clean Academic Integrity Record</p>
              <p className="mt-0.5">No proctoring violations were recorded during your exam session.</p>
            </div>
          )}
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
