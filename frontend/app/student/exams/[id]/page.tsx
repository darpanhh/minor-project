"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";
import ProctoringMonitor from "@/src/components/ProctoringMonitor";

export default function TakeExamPage() {
  const { id: examId } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const eventIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const firstSwitchRef = useRef(false);

  const [exam, setExam] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [cameraWarnings, setCameraWarnings] = useState(0);
  const [aiAlerts, setAiAlerts] = useState<{ type: string; message: string }[]>([]);

  useEffect(() => {
    if (!examId) return;
    Promise.all([api.getExam(examId), api.mySessionForExam(examId)])
      .then(([e, s]) => {
        if (!s) { setError("You are not registered for this exam."); return; }
        setExam(e);
        setSession(s);
        if (s.status === "submitted") { router.push(`/student/results?session=${s.id}`); return; }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [examId, router]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      setCameraWarnings((w) => w + 1);
      setError("Camera access denied. Camera is required for this exam.");
    }
  }, []);

  useEffect(() => {
    if (session?.status === "registered" || session?.status === "in_progress") startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (eventIntervalRef.current) clearInterval(eventIntervalRef.current);
    };
  }, [session, startCamera]);

  useEffect(() => {
    if (session?.status === "in_progress") {
      firstSwitchRef.current = false;
    }
  }, [session?.status]);

  useEffect(() => {
    if (!session || session.status === "submitted") return;
    const handleVisibility = () => {
      if (document.hidden) {
        if (!firstSwitchRef.current) {
          firstSwitchRef.current = true;
          setTabSwitches(1);
          return;
        }
        setTabSwitches((prev) => {
          const n = prev + 1;
          api.logProctoringEvent(session.id, "tab_switch", Math.min(n * 0.2, 1.0)).catch(() => {});
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
      if (remaining <= 0) handleSubmit();
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [session, exam]);

  async function beginExam() {
    if (!session) return;
    try {
      const updated = await api.startSession(session.id);
      setSession(updated);
    } catch (err: any) { setError(err.message); }
  }

  async function handleSubmit() {
    if (submitting || !session) return;
    setSubmitting(true);
    try {
      const updated = await api.submitSession(session.id, answers);
      setSession(updated);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (eventIntervalRef.current) clearInterval(eventIntervalRef.current);
      router.push(`/student/results?session=${updated.id}`);
    } catch (err: any) { setError(err.message); setSubmitting(false); }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) return <ProtectedRoute role="student"><div className="p-8 text-center">
    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
  </div></ProtectedRoute>;

  if (error && !session) return <ProtectedRoute role="student"><div className="p-8 text-center text-red-600">{error}</div></ProtectedRoute>;
  if (!exam) return <ProtectedRoute role="student"><div className="p-8 text-center">Exam not found</div></ProtectedRoute>;

  if (session?.status === "registered") {
    return (
      <ProtectedRoute role="student">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="content-card max-w-lg w-full text-center animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{exam.title}</h1>
            <p className="text-sm text-slate-500 mb-6">
              {exam.questions?.length || 0} questions &middot; {exam.duration_min} minutes
            </p>
            <div className="mb-6">
              <video ref={videoRef} autoPlay playsInline muted className="w-56 h-42 mx-auto rounded-xl bg-black object-cover" />
              {!cameraActive && <p className="text-sm text-red-600 mt-2">Waiting for camera...</p>}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-left">
              <p className="text-xs text-amber-800 font-medium mb-1">Before you start:</p>
              <ul className="text-xs text-amber-700 space-y-1">
                <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> Camera must stay on throughout</li>
                <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> Tab switching is monitored</li>
                <li className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> AI proctoring is active</li>
              </ul>
            </div>
            <button onClick={beginExam} disabled={!cameraActive} className="btn-primary px-8">
              {cameraActive ? "Start Exam" : "Waiting for camera..."}
            </button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (session?.status === "in_progress") {
    return (
      <ProtectedRoute role="student">
        <div className="min-h-screen flex flex-col lg:flex-row">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{exam.title}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {Object.keys(answers).length} of {exam.questions?.length || 0} answered
                  </p>
                </div>
                {timeLeft !== null && (
                  <div className={`text-xl font-mono font-bold px-4 py-2 rounded-xl ${
                    timeLeft < 120 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-700"
                  }`}>
                    {formatTime(timeLeft)}
                  </div>
                )}
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}

              <div className="space-y-5">
                {exam.questions?.map((q: any, i: number) => (
                  <div key={i} className="content-card">
                    <p className="font-medium text-slate-900 mb-4">
                      <span className="text-indigo-600 font-bold mr-2">{i + 1}.</span>
                      {q.question}
                    </p>
                    <div className="space-y-2.5">
                      {q.options?.map((opt: string, oi: number) => (
                        <label
                          key={oi}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                            answers[String(i)] === oi
                              ? "border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-200/50"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${i}`}
                            checked={answers[String(i)] === oi}
                            onChange={() => setAnswers({ ...answers, [String(i)]: oi })}
                            className="w-4 h-4 accent-indigo-600 shrink-0"
                          />
                          <span className={`text-sm ${answers[String(i)] === oi ? "text-indigo-900 font-medium" : "text-slate-700"}`}>
                            {String.fromCharCode(65 + oi)}. {opt}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex justify-between items-center sticky bottom-0 bg-white py-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  {Object.keys(answers).length} of {exam.questions?.length || 0} answered
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-primary flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Submitting...
                    </>
                  ) : "Submit Exam"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              Live Proctoring
            </p>

            {session && (
              <ProctoringMonitor
                sessionId={session.id}
                videoRef={videoRef}
                onAlert={(a) => setAiAlerts((prev) => [a, ...prev].slice(0, 20))}
              />
            )}

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Camera</span>
                <span className={`font-medium flex items-center gap-1.5 ${cameraActive ? "text-emerald-600" : "text-red-600"}`}>
                  <span className={`w-2 h-2 rounded-full ${cameraActive ? "bg-emerald-500" : "bg-red-500"}`} />
                  {cameraActive ? "Active" : "Off"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Tab Switches</span>
                <span className={tabSwitches > 1 ? "text-red-600 font-medium" : "text-slate-700"}>
                  {tabSwitches > 0 ? `${tabSwitches} (1st is warning)` : "0"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">AI Violations</span>
                <span className={aiAlerts.length > 0 ? "text-red-600 font-medium" : "text-slate-700"}>{aiAlerts.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Time Left</span>
                <span className="font-mono font-medium">{timeLeft !== null ? formatTime(timeLeft) : "--:--"}</span>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return <ProtectedRoute role="student"><div className="p-8 text-center">Session status: {session?.status}</div></ProtectedRoute>;
}
