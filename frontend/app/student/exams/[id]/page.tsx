"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import ProctoringMonitor from "@/src/components/ProctoringMonitor";

export default function TakeExamPage() {
  const { id: examId } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const firstSwitchRef = useRef(false);
  const handleSubmitRef = useRef<(() => void) | null>(null);

  const [exam, setExam] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [aiAlerts, setAiAlerts] = useState<{ type: string; message: string }[]>([]);

  useEffect(() => {
    if (!examId) return;
    Promise.all([api.getExam(examId), api.mySessionForExam(examId)])
      .then(([e, s]) => {
        if (!s) { setError("You are not registered for this exam."); return; }
        setExam(e);
        setSession(s);
        if (s.status === "submitted") { router.push(`/student/results?session=${s.id}`); return; }
        if (s.status === "registered") { router.replace(`/student/exams/${examId}/verify`); return; }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [examId, router]);

  useEffect(() => {
    if (session?.status !== "registered" && session?.status !== "in_progress") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraActive(true);
      } catch {
        setError("Camera access denied. Camera is required for this exam.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (session?.status === "in_progress") {
      firstSwitchRef.current = false;
    }
  }, [session?.status]);

  useEffect(() => {
    if (!session || session.status === "submitted") return;
    const captureFrame = (): string | undefined => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return undefined;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(video, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.6);
    };
    const handleVisibility = () => {
      if (document.hidden) {
        if (!firstSwitchRef.current) {
          firstSwitchRef.current = true;
          setTabSwitches(1);
          return;
        }
        setTabSwitches((prev) => {
          const n = prev + 1;
          api.logProctoringEvent(session.id, "tab_switch", Math.min(n * 0.2, 1.0), captureFrame()).catch(() => {});
          return n;
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session]);

  useEffect(() => {
    if (!session || session.status !== "in_progress" || !exam) return;
    const endTime = new Date(exam.start_time).getTime() + exam.duration_min * 60000;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) handleSubmitRef.current?.();
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [session, exam]);

  async function handleSubmit() {
    if (submitting || !session) return;
    setSubmitting(true);
    try {
      const updated = await api.submitSession(session.id, answers);
      setSession(updated);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      router.push(`/student/results?session=${updated.id}`);
    } catch (err: any) { setError(err.message); setSubmitting(false); }
  }

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) return (
    <ProtectedRoute role="student">
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Loading exam session & proctoring environment...</p>
      </div>
    </ProtectedRoute>
  );

  if (error && !session) return (
    <ProtectedRoute role="student">
      <div className="max-w-md mx-auto my-12 p-6 bg-destructive/10 border border-destructive/20 rounded-2xl text-center">
        <span className="material-symbols-outlined text-4xl text-destructive mb-2">error</span>
        <p className="text-sm font-semibold text-destructive">{error}</p>
      </div>
    </ProtectedRoute>
  );

  if (!exam) return (
    <ProtectedRoute role="student">
      <div className="p-12 text-center text-muted-foreground">Exam not found</div>
    </ProtectedRoute>
  );

  if (session?.status === "in_progress") {
    return (
      <ProtectedRoute role="student">
        <div className="min-h-screen flex flex-col lg:flex-row bg-background">
          {/* Main Questions Area */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Exam Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-card border border-border/80 rounded-2xl p-5 shadow-sm gap-4">
                <div>
                  <h1 className="text-xl font-bold text-foreground">{exam.title}</h1>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span>{Object.keys(answers).length} of {exam.questions?.length || 0} questions answered</span>
                    <span>•</span>
                    <span>{exam.duration_min} minutes allotted</span>
                  </p>
                </div>

                {timeLeft !== null && (
                  <div
                    className={`flex items-center gap-2 text-xl font-mono font-bold px-4 py-2 rounded-xl border ${
                      timeLeft < 120
                        ? "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
                        : "bg-muted/70 text-foreground border-border"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">timer</span>
                    <span>{formatTime(timeLeft)}</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 text-sm text-destructive flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">warning</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Questions List */}
              <div className="space-y-6">
                {exam.questions?.map((q: any, i: number) => {
                  const isAnswered = answers[String(i)] !== undefined;
                  return (
                    <div
                      key={i}
                      className={`bg-card border rounded-2xl p-6 transition-all shadow-sm ${
                        isAnswered ? "border-primary/50 ring-1 ring-primary/20" : "border-border/80"
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="font-semibold text-foreground text-base leading-snug">
                          {q.question}
                        </p>
                      </div>

                      <div className="space-y-3 pl-10">
                        {q.options?.map((opt: string, oi: number) => {
                          const selected = answers[String(i)] === oi;
                          return (
                            <label
                              key={oi}
                              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                                selected
                                  ? "border-primary bg-primary/5 text-foreground font-medium shadow-sm"
                                  : "border-border/80 hover:border-border hover:bg-muted/40 text-muted-foreground"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${i}`}
                                checked={selected}
                                onChange={() => setAnswers({ ...answers, [String(i)]: oi })}
                                className="w-4 h-4 accent-primary shrink-0"
                              />
                              <span className="text-sm">
                                <strong className="mr-2 font-bold opacity-75">{String.fromCharCode(65 + oi)}.</strong>
                                {opt}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions Footer */}
              <div className="mt-8 flex items-center justify-between sticky bottom-4 bg-card/90 backdrop-blur-xl p-4 border border-border/80 rounded-2xl shadow-xl z-10">
                <p className="text-xs text-muted-foreground font-medium">
                  {Object.keys(answers).length} of {exam.questions?.length || 0} completed
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Submitting Answers...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Final Answers</span>
                      <span className="material-symbols-outlined text-lg">send</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Live AI Proctoring Sidebar */}
          <div className="lg:w-88 border-t lg:border-t-0 lg:border-l border-border/80 bg-card p-5 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border/80">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live AI Proctoring</span>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                Active
              </span>
            </div>

            {session && (
              <ProctoringMonitor
                sessionId={session.id}
                videoRef={videoRef}
                onAlert={(a) => setAiAlerts((prev) => [a, ...prev].slice(0, 20))}
              />
            )}

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground font-medium">Camera Feed</span>
                <span className={`font-semibold flex items-center gap-1.5 ${cameraActive ? "text-emerald-600" : "text-destructive"}`}>
                  <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-500" : "bg-destructive"}`} />
                  {cameraActive ? "Active Stream" : "Disabled"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground font-medium">Tab Switches</span>
                <span className={tabSwitches > 1 ? "text-destructive font-bold" : "text-foreground font-semibold"}>
                  {tabSwitches > 0 ? `${tabSwitches} (Warning logged)` : "0"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground font-medium">AI Flagged Violations</span>
                <span className={aiAlerts.length > 0 ? "text-destructive font-bold" : "text-foreground font-semibold"}>
                  {aiAlerts.length}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/50">
                <span className="text-muted-foreground font-medium">Time Remaining</span>
                <span className="font-mono font-bold text-foreground">
                  {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute role="student">
      <div className="p-8 text-center text-muted-foreground">Session status: {session?.status}</div>
    </ProtectedRoute>
  );
}
