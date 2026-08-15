"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/src/services/api";
import { useAuth } from "@/src/contexts/AuthContext";
// Local fallback Button to avoid missing import during verification
function Button({
  children,
  className = "",
  disabled,
  onClick,
}: React.PropsWithChildren<{
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}>) {
  return (
    <button
      className={`btn ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface CalibrationPoint {
  id: string;
  label: string;
  description?: string;
  x?: number;
  y?: number;
  image?: string;
}

const EXAM_RULES: { icon: string; title: string; detail: string }[] = [
  { icon: "fullscreen", title: "Fullscreen & Camera ON", detail: "Answer only in fullscreen; keep your camera on for the whole exam." },
  { icon: "visibility", title: "Complete Calibration", detail: "Do the eye and head calibration properly — follow every prompt before starting." },
  { icon: "smartphone", title: "No Phones, Clear Desk", detail: "No mobile devices, notes, or other people in the camera frame." },
  { icon: "tab", title: "No Tab Switching / Gazing Away", detail: "Stay in the exam window and watch the screen — both are monitored." },
  { icon: "warning", title: "Violations Are Recorded", detail: "All violations are recorded with timestamps and reviewed by the admin." },
  { icon: "timer", title: "Auto-Submit on Timer", detail: "The exam submits when the timer hits zero; unanswered questions score zero." },
];

const EYE_CALIBRATION_POINTS: CalibrationPoint[] = [
  { id: "top_left", label: "Top Left", x: 5, y: 6 },
  { id: "top_right", label: "Top Right", x: 95, y: 6 },
  { id: "bottom_left", label: "Bottom Left", x: 5, y: 94 },
  { id: "bottom_right", label: "Bottom Right", x: 95, y: 94 },
];

const HEAD_CALIBRATION_POINTS: CalibrationPoint[] = [
  { id: "head_forward", label: "Center", description: "Look like the image — Center (face straight ahead)", image: "/forward.jpeg" },
  { id: "head_left", label: "Left", description: "Look like the image — Left (turn your head to the LEFT)", image: "/left.jpeg" },
  { id: "head_right", label: "Right", description: "Look like the image — Right (turn your head to the RIGHT)", image: "/right.jpeg" },
];

const WS_BASE =
  process.env.NEXT_PUBLIC_PROCTOR_WS_URL || "ws://localhost:8000/ws/proctor";
// ~2s per calibration point (20 frames at 100ms) — stays under the 3s limit.
const FRAMES_PER_POINT = 20;
const CAPTURE_INTERVAL_MS = 100;
// Time-based capture: the student looks at the point for 3 seconds, then
// the 20 frames are captured automatically.
const COUNTDOWN_SECONDS = 3;

export default function VerifyPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [phase, setPhase] = useState<"rules" | "calibration" | "head" | "complete">("rules");
  const [points, setPoints] = useState<CalibrationPoint[]>(EYE_CALIBRATION_POINTS);
  const [calibrationPointIndex, setCalibrationPointIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const calibratingRef = useRef(true);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Track fullscreen state ─────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // The camera preview only exists inside the fullscreen calibration UI,
  // so the live stream must be re-attached whenever it (re)mounts.
  useEffect(() => {
    if (pipRef.current && mediaStreamRef.current) {
      pipRef.current.srcObject = mediaStreamRef.current;
    }
  }, [isFullscreen, phase]);

  // ── Fetch the exam session for calibration ─────────────────────
  useEffect(() => {
    if (!user) return;
    api.mySessionForExam(params.id as string)
      .then((s) => { if (s) setSession(s); })
      .catch((err) => console.error("Failed to fetch session:", err));
  }, [params.id, user]);

  // ── Start camera for calibration (eye + head phases) ───────────
  useEffect(() => {
    if (phase !== "calibration" && phase !== "head") return;

    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        if (pipRef.current) {
          pipRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access failed:", err);
      }
    };
    start();

    return () => {
      cancelled = true;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [phase]);

  // ── Build calibration WebSocket URL ────────────────────────────
  const buildCalibrationUrl = useCallback((): string => {
    let wsUrl = WS_BASE;
    if (typeof window !== "undefined") {
      try {
        const urlObj = new URL(wsUrl);
        if (window.location.protocol === "https:" && urlObj.protocol === "ws:") {
          urlObj.protocol = "wss:";
        }
        if (window.location.protocol === "http:" && urlObj.protocol === "wss:") {
          urlObj.protocol = "ws:";
        }
        const isLocalBackend =
          urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1";
        if (isLocalBackend) {
          urlObj.hostname = window.location.hostname;
        }
        wsUrl = urlObj.toString();
      } catch {
        const scheme = window.location.protocol === "https:" ? "wss" : "ws";
        wsUrl = `${scheme}://${window.location.hostname}:8000/ws/proctor`;
      }
    }
    return `${wsUrl}/calibration/${session?.id || params.id}`;
  }, [session?.id, params.id]);

  // ── Connect WebSocket on calibration start (eye + head) ────────
  useEffect(() => {
    if (phase !== "calibration" && phase !== "head") return;
    calibratingRef.current = true;
    const url = buildCalibrationUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onerror = () => console.error("Calibration WS error");
    ws.onopen = () => console.log("Calibration WS connected");

    return () => {
      calibratingRef.current = false;
      wsRef.current = null;
      ws.close();
    };
  }, [phase, buildCalibrationUrl]);

  // ── Capture frames for the current point ───────────────────────
  async function captureCurrentPoint() {
    const ws = wsRef.current;
    const video = videoRef.current;
    if (!ws || !video || ws.readyState !== WebSocket.OPEN) return;

    setCapturing(true);
    setCapturedFrames(0);

    let framesCaptured = 0;
    for (let f = 0; f < FRAMES_PER_POINT; f++) {
      if (!calibratingRef.current) return;
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth || 640;
      captureCanvas.height = video.videoHeight || 480;
      const ctx = captureCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        ws.send(
          JSON.stringify({
            point: points[calibrationPointIndex].id,
            frame_number: f + 1,
            frame: captureCanvas.toDataURL("image/jpeg", 0.6),
          })
        );
      }
      framesCaptured = f + 1;
      setCapturedFrames(framesCaptured);
      await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
    }
    setCapturing(false);
    // Incomplete capture — require a fresh recording.
    if (framesCaptured < FRAMES_PER_POINT) {
      setCapturedFrames(0);
    }
  }

  // ── 3-2-1 countdown, then automatically capture ────────────────
  const beginCapture = () => {
    setCapturedFrames(0);
    setCountdown(COUNTDOWN_SECONDS);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
  };

  const captureCurrentPointRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    captureCurrentPointRef.current = captureCurrentPoint;
  });

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      captureCurrentPointRef.current();
    }
  }, [countdown]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const retryPoint = () => beginCapture();

  const enterCalibrationFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error("Fullscreen request failed:", err);
    }
  };

  function nextPoint() {
    const next = calibrationPointIndex + 1;
    if (next >= points.length) {
      if (phase === "calibration") {
        // Eye calibration done → head calibration runs as a separate,
        // normal (window-mode) screen, so leave fullscreen first.
        document.exitFullscreen?.().catch(() => {});
        setPhase("head");
        setPoints(HEAD_CALIBRATION_POINTS);
        setCalibrationPointIndex(0);
        setCapturedFrames(0);
      } else {
        // Head calibration done → calibration complete.
        wsRef.current?.close();
        wsRef.current = null;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        setPhase("complete");
      }
    } else {
      setCalibrationPointIndex(next);
      setCapturedFrames(0);
    }
  }

  const restartCalibration = () => {
    setPhase("calibration");
    setPoints(EYE_CALIBRATION_POINTS);
    setCalibrationPointIndex(0);
    setCapturedFrames(0);
    setCountdown(null);
  };

  // Restart the current phase from its FIRST point (not just the current one).
  const restartPoints = () => {
    if (capturing) return;
    setPoints(phase === "head" ? HEAD_CALIBRATION_POINTS : EYE_CALIBRATION_POINTS);
    setCalibrationPointIndex(0);
    setCapturedFrames(0);
    setCountdown(null);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const currentPoint = points[calibrationPointIndex] ?? null;

  // Total progress across both calibration stages (eye then head).
  const overallProgress =
    phase === "head"
      ? 50 + ((calibrationPointIndex + capturedFrames / FRAMES_PER_POINT) / points.length) * 50
      : ((calibrationPointIndex + capturedFrames / FRAMES_PER_POINT) / points.length) * 50;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Phase: exam rules & terms ────────────────────────────── */}
      {phase === "rules" && (
        <>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">Exam Rules</h2>
              <p className="text-sm text-muted-foreground">
                Please read and agree before starting the exam.
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="space-y-2.5">
              {EXAM_RULES.map((rule) => (
                <div
                  key={rule.title}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-border/80 bg-muted/40"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-lg">{rule.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight">{rule.title}</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {rule.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <label
              className={`flex items-center gap-3 mt-4 p-3.5 rounded-xl border cursor-pointer transition-all ${
                agreeError
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  setAgreeError(false);
                }}
                className="w-4 h-4 accent-primary shrink-0"
              />
              <span className="text-sm text-muted-foreground">
                I have read and agree to the exam rules and terms. I understand
                that violations are recorded and reviewed by the administrator.
              </span>
            </label>
            {agreeError && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">warning</span>
                Please accept the rules before continuing.
              </p>
            )}

            <button
              onClick={() => {
                if (!agreed) {
                  setAgreeError(true);
                  return;
                }
                setPhase("calibration");
              }}
              className="w-full mt-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              I Agree — Continue to Calibration
            </button>
          </div>
        </>
      )}

      {/* ── Phase: eye calibration (FULLSCREEN) ───────────────────── */}
      {phase === "calibration" && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-between overflow-hidden p-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-transparent to-slate-950/90 pointer-events-none" />

          {!isFullscreen ? (
            <div className="relative z-30 flex flex-col items-center gap-5 text-center max-w-md my-auto">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-blue-400">fullscreen</span>
              </div>
              <div>
                <h2 className="text-white text-xl font-bold">Eye Calibration Requires Fullscreen</h2>
                <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                  Enter fullscreen mode so the calibration dots fill your screen
                  and your eye movements can be tracked accurately.
                </p>
              </div>
              <button
                onClick={enterCalibrationFullscreen}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-500/25 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">fullscreen</span>
                Enter Fullscreen &amp; Start Calibration
              </button>
            </div>
          ) : (
            <>
              {/* Camera preview — centre-right, clear of the corner dots and toolbar */}
              <div className="absolute right-6 top-1/2 -translate-y-1/2 z-30 w-40 sm:w-48 rounded-2xl overflow-hidden border-2 border-white/50 bg-slate-800 shadow-[0_0_30px_rgba(0,0,0,0.7)] pointer-events-none">
                <video
                  ref={pipRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-video object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm px-2 py-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-semibold text-white">You (live)</span>
                </div>
              </div>

              {/* Floating Top Banner */}
              <div className="relative z-20 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-full px-6 py-2.5 shadow-2xl flex items-center gap-3 text-white text-sm font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                <span>Look directly at the <strong className="text-blue-400 font-bold capitalize">{currentPoint?.label || ""}</strong> point dot</span>
              </div>

              {/* Calibration Target Dot */}
              {currentPoint && (
                <div
                  className="absolute z-30 transition-all duration-300 ease-out"
                  style={{
                    left: `${currentPoint.x}%`,
                    top: `${currentPoint.y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <div className="relative flex items-center justify-center">
                    <div className="absolute -inset-4 rounded-full bg-blue-500/20 border-2 border-blue-500/80 animate-ping" />
                    <div className="absolute -inset-2 rounded-full border border-cyan-400/60 animate-pulse" />
                    <div className="w-7 h-7 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-full shadow-[0_0_20px_rgba(56,189,248,0.8)] border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-950">
                      {calibrationPointIndex + 1}
                    </div>
                  </div>
                </div>
              )}

              {/* Countdown overlay */}
              {countdown !== null && countdown > 0 && (
                <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-slate-300 text-lg font-medium">Look at the point…</span>
                    <span className="text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(56,189,248,0.8)]">
                      {countdown}
                    </span>
                  </div>
                </div>
              )}

              {/* Capture progress overlay (centre) */}
              {capturing && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <div className="flex items-center gap-2.5 text-white font-bold text-lg">
                    <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    Recording gaze data ({capturedFrames}/{FRAMES_PER_POINT})...
                  </div>
                  <div className="w-64 bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
                      style={{ width: `${(capturedFrames / FRAMES_PER_POINT) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Done overlay (centre) */}
              {!capturing && (countdown === null || countdown <= 0) && capturedFrames >= FRAMES_PER_POINT && (
                <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                  <div className="bg-emerald-600/20 border border-emerald-400/40 text-emerald-400 rounded-2xl px-8 py-4 font-bold text-lg flex items-center gap-2.5 shadow-2xl">
                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                    Done — Point captured successfully
                  </div>
                </div>
              )}

              {/* Floating Bottom Control Toolbar */}
              <div className="relative z-20 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 max-w-md w-full mb-2">
                <div className="flex items-center justify-between w-full text-xs text-slate-400 px-1">
                  <span>Eye calibration · Point {calibrationPointIndex + 1} of {points.length} ({currentPoint?.label})</span>
                  <div className="flex items-center gap-3">
                    <span>{capturedFrames}/{FRAMES_PER_POINT} frames</span>
                    <button
                      onClick={restartPoints}
                      className="text-slate-400 hover:text-white flex items-center gap-1 transition"
                    >
                      <span className="material-symbols-outlined text-sm">replay</span>
                      Restart
                    </button>
                  </div>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
                    style={{
                      width: `${overallProgress}%`,
                    }}
                  />
                </div>

                <div className="flex items-center gap-3 w-full pt-1">
                  {countdown !== null && countdown > 0 ? (
                    <div className="w-full py-2.5 bg-blue-600/80 border border-blue-400/40 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-base">visibility</span>
                      Look at the point — capturing in {countdown}…
                    </div>
                  ) : capturing ? (
                    <div className="w-full py-2.5 text-center text-xs text-slate-400">
                      Capturing in progress…
                    </div>
                  ) : capturedFrames >= FRAMES_PER_POINT ? (
                    <>
                      <button
                        onClick={retryPoint}
                        className="flex-1 py-2.5 bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">replay</span>
                        Retry
                      </button>
                      <button
                        onClick={nextPoint}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
                      >
                        <span>{calibrationPointIndex >= points.length - 1 ? "Start Head Calibration" : "Next Point"}</span>
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={beginCapture}
                      className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">center_focus_strong</span>
                      Start Capture Point
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Phase: head calibration (separate window-mode screen) ── */}
      {phase === "head" && (
        <div className="bg-card border border-border rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Head Calibration</h2>
            <p className="text-muted-foreground">
              Look like the image shown, then capture.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Reference image with description */}
            <div className="space-y-3">
              <div className="rounded-2xl overflow-hidden border-2 border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- static calibration guide image from /public */}
                <img
                  src={currentPoint?.image}
                  alt={`Look ${currentPoint?.label}`}
                  className="w-full aspect-video object-cover"
                />
              </div>
              <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-center">
                <p className="text-sm font-bold text-cyan-800">
                  {currentPoint?.label} — {currentPoint?.description}
                </p>
              </div>
            </div>

            {/* Live camera preview + controls */}
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-border bg-slate-900 aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-2 left-2 text-[11px] font-medium text-white/80 bg-black/50 rounded-full px-2 py-0.5">
                  You (live)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Point {calibrationPointIndex + 1} of {points.length} — {currentPoint?.label}</span>
                <div className="flex items-center gap-3">
                  <span>{capturedFrames}/{FRAMES_PER_POINT} frames</span>
                  <button
                    onClick={restartPoints}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    Restart
                  </button>
                </div>
              </div>

              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>

              <div className="pt-1 space-y-3">
                {countdown !== null && countdown > 0 ? (
                  <div className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-base">visibility</span>
                    Look like the image — capturing in {countdown}…
                  </div>
                ) : capturing ? (
                  <div className="w-full py-3 bg-slate-50 border border-border rounded-xl flex flex-col items-center justify-center gap-2.5">
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <span>Recording head pose ({capturedFrames}/{FRAMES_PER_POINT})...</span>
                    </div>
                    <div className="w-64 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-200"
                        style={{ width: `${(capturedFrames / FRAMES_PER_POINT) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : capturedFrames >= FRAMES_PER_POINT ? (
                  <>
                    <div className="w-full py-3 bg-emerald-100 border border-emerald-300 text-emerald-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Done — Point captured successfully
                    </div>
                    <div className="flex items-center gap-3 w-full">
                      <button
                        onClick={retryPoint}
                        className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">replay</span>
                        Retry
                      </button>
                      <button
                        onClick={nextPoint}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
                      >
                        <span>{calibrationPointIndex >= points.length - 1 ? "Complete Calibration" : "Next Point"}</span>
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={beginCapture}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">screen_search_desktop</span>
                    Start Head Pose Capture
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase: complete ──────────────────────────────────────── */}
      {phase === "complete" && (
        <>
          <div>
            <h2 className="text-2xl font-bold">Calibration Complete</h2>
            <p className="text-muted-foreground">
              Your gaze tracking has been calibrated. You can now
              start the exam.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6 p-4 bg-primary/10 rounded-lg border border-primary/20">
              <span className="material-symbols-outlined text-primary text-3xl">
                check_circle
              </span>
              <div>
                <p className="font-medium text-primary">
                  Calibration Complete
                </p>
                <p className="text-sm text-muted-foreground">
                  All 4 eye and 3 head calibration points have been recorded
                  successfully.
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={starting}
              onClick={async () => {
                if (!session || starting) return;
                setStarting(true);
                try {
                  // Enter fullscreen from within this user gesture — Chrome
                  // rejects requestFullscreen() outside a gesture, and the
                  // exam page mounts already in fullscreen after navigation.
                  if (!document.fullscreenElement) {
                    try {
                      await document.documentElement.requestFullscreen();
                    } catch (err) {
                      console.error("Fullscreen request failed:", err);
                    }
                  }
                  await api.startSession(session.id);
                  router.push(`/student/exams/${params.id}`);
                } catch (err: any) {
                  console.error("Failed to start session:", err);
                  setStarting(false);
                }
              }}
            >
              <span>{starting ? "Starting..." : "Start Exam"}</span>
              <span className="material-symbols-outlined ml-2">
                arrow_forward
              </span>
            </Button>
            <Button
              className="w-full mt-3"
              onClick={restartCalibration}
            >
              <span className="material-symbols-outlined mr-2">replay</span>
              Recalibrate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}