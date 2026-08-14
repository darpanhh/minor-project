"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/src/services/api";
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

interface CheckItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: "pending" | "in_progress" | "complete" | "error";
}

interface CalibrationPoint {
  id: string;
  label: string;
  x?: number;
  y?: number;
  image?: string;
}

const EYE_CALIBRATION_POINTS: CalibrationPoint[] = [
  { id: "top_left", label: "Top Left", x: 5, y: 6 },
  { id: "top_right", label: "Top Right", x: 95, y: 6 },
  { id: "bottom_left", label: "Bottom Left", x: 5, y: 94 },
  { id: "bottom_right", label: "Bottom Right", x: 95, y: 94 },
];

const HEAD_CALIBRATION_POINTS: CalibrationPoint[] = [
  { id: "head_forward", label: "Forward", image: "/forward.jpeg" },
  { id: "head_left", label: "Left", image: "/left.jpeg" },
  { id: "head_right", label: "Right", image: "/right.jpeg" },
];

const WS_BASE =
  process.env.NEXT_PUBLIC_PROCTOR_WS_URL || "ws://localhost:8000/ws/proctor";
// ~2s per calibration point (20 frames at 100ms) — stays under the 3s limit.
const FRAMES_PER_POINT = 20;
const CAPTURE_INTERVAL_MS = 100;

export default function VerifyPage() {
  const params = useParams();
  const router = useRouter();
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "camera", label: "Camera Access", description: "High-definition enabled", icon: "videocam", status: "pending" },
    { id: "audio", label: "Audio Check", description: "System default input active", icon: "mic", status: "pending" },
    { id: "face", label: "Identity Match", description: "Biometric verification", icon: "badge", status: "pending" },
    { id: "room", label: "Room Scan", description: "Detecting surroundings...", icon: "room_preferences", status: "pending" },
  ]);
  const [phase, setPhase] = useState<"checks" | "calibration" | "complete">("checks");
  const [activeSet, setActiveSet] = useState<"eye" | "head">("eye");
  const [points, setPoints] = useState<CalibrationPoint[]>(EYE_CALIBRATION_POINTS);
  const [calibrationPointIndex, setCalibrationPointIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [session, setSession] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const calibratingRef = useRef(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== "undefined" && !!document.fullscreenElement
  );

  // ── Track fullscreen state ─────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.error("Fullscreen request failed:", err);
    }
  }, []);

  // ── Existing verification checks (unchanged logic) ─────────────
  useEffect(() => {
    const runChecksAndFetchSession = async () => {
      for (let i = 0; i < checks.length; i++) {
        setChecks((prev) =>
          prev.map((c, idx) =>
            idx === i ? { ...c, status: "in_progress" as const } : c
          )
        );
        await new Promise((r) => setTimeout(r, 1000));
        setChecks((prev) =>
          prev.map((c, idx) =>
            idx === i ? { ...c, status: "complete" as const } : c
          )
        );
      }
      try {
        const s = await api.mySessionForExam(params.id as string);
        if (s) setSession(s);
      } catch (err) {
        console.error("Failed to fetch session:", err);
      }
      setPhase("calibration");
    };
    runChecksAndFetchSession();
  }, [checks.length, params.id]);

  // ── Start camera for calibration ───────────────────────────────
  useEffect(() => {
    if (phase !== "calibration") return;

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

  const [capturing, setCapturing] = useState(false);

  // ── Connect WebSocket on calibration start ─────────────────────
  useEffect(() => {
    if (phase !== "calibration") return;
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
    if (!document.fullscreenElement) return;

    const point = points[calibrationPointIndex];
    setCapturing(true);
    setCapturedFrames(0);

    let framesCaptured = 0;
    for (let f = 0; f < FRAMES_PER_POINT; f++) {
      if (!calibratingRef.current) return;
      // Abort capture if the student leaves fullscreen mid-recording.
      if (!document.fullscreenElement) break;
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth || 640;
      captureCanvas.height = video.videoHeight || 480;
      const ctx = captureCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        ws.send(
          JSON.stringify({
            point: point.id,
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
    // Incomplete capture (e.g. left fullscreen) — require a fresh recording.
    if (framesCaptured < FRAMES_PER_POINT) {
      setCapturedFrames(0);
    }
  }

  function nextPoint() {
    const next = calibrationPointIndex + 1;
    if (next >= points.length) {
      if (activeSet === "eye") {
        setActiveSet("head");
        setPoints(HEAD_CALIBRATION_POINTS);
        setCalibrationPointIndex(0);
        setCapturedFrames(0);
      } else {
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

  const currentPoint = points[calibrationPointIndex] ?? null;

  // Total progress across both calibration stages (eye then head).
  const calibrationTotal =
    (activeSet === "head" ? 1 : 0) +
    (calibrationPointIndex + capturedFrames / FRAMES_PER_POINT) / points.length;
  const overallProgress = (calibrationTotal / 2) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Phase: verification checks ────────────────────────────── */}
      {phase === "checks" && (
        <>
          <div>
            <h2 className="text-2xl font-bold">Identity Verification</h2>
            <p className="text-muted-foreground">
              Complete all checks to unlock your examination portal
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="relative aspect-video bg-muted rounded-xl overflow-hidden border-2 border-border">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-muted-foreground">
                  videocam
                </span>
              </div>
              <div className="absolute inset-0 border-2 border-primary/30 rounded-lg pointer-events-none">
                <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4 border border-primary/50 rounded-xl">
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 flex gap-2">
                <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 border border-border">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-xs">Camera OK</span>
                </div>
                <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 border border-border">
                  <span className="material-symbols-outlined text-xs text-primary">face</span>
                  <span className="text-xs">Face Detected</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center italic">
              Please ensure your face is clearly visible and centered in
              the frame.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-1">
              Identity Verification
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Complete all checks to unlock your examination portal.
            </p>

            <div className="space-y-3 mb-6">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    check.status === "complete"
                      ? "bg-muted border-border"
                      : check.status === "in_progress"
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted/50 border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined">
                        {check.icon}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{check.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {check.description}
                      </p>
                    </div>
                  </div>
                  {check.status === "complete" && (
                    <span className="material-symbols-outlined text-primary">
                      check_circle
                    </span>
                  )}
                  {check.status === "in_progress" && (
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                  {check.status === "pending" && (
                    <span className="material-symbols-outlined text-muted-foreground">
                      radio_button_unchecked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Phase: calibration ───────────────────────────────────── */}
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

          {/* Fullscreen Gate — block calibration until fullscreen */}
          {!isFullscreen && (
            <div className="absolute inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-6">
              <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center mx-auto text-cyan-400">
                  <span className="material-symbols-outlined text-3xl">fullscreen</span>
                </div>
                <h3 className="text-white text-lg font-bold">Fullscreen Required</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Calibration must be performed in fullscreen mode. Enter fullscreen to continue.
                </p>
                <button
                  onClick={enterFullscreen}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">fullscreen</span>
                  Enter Fullscreen
                </button>
              </div>
            </div>
          )}

          {/* Floating Top Banner */}
          <div className="relative z-20 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-full px-6 py-2.5 shadow-2xl flex items-center gap-3 text-white text-sm font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
            {activeSet === "head" ? (
              <span>
                Head calibration — look <strong className="text-cyan-400 font-bold uppercase">{currentPoint?.label || ""}</strong> exactly as shown
              </span>
            ) : (
              <span>Look directly at the <strong className="text-blue-400 font-bold capitalize">{currentPoint?.label || ""}</strong> point dot</span>
            )}
          </div>

          {/* Calibration Target */}
          {currentPoint?.image ? (
            <div className="relative z-30 w-64 h-64 md:w-72 md:h-72 rounded-2xl overflow-hidden border-2 border-cyan-400/60 shadow-[0_0_40px_rgba(34,211,238,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static calibration guide image from /public */}
              <img
                src={currentPoint.image}
                alt={`Look ${currentPoint.label}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            currentPoint && (
              <div
                className="absolute z-30 transition-all duration-300 ease-out"
                style={{
                  left: `${currentPoint.x}%`,
                  top: `${currentPoint.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="relative flex items-center justify-center">
                  {/* Outer glowing pulsing ring */}
                  <div className="absolute -inset-4 rounded-full bg-blue-500/20 border-2 border-blue-500/80 animate-ping" />
                  <div className="absolute -inset-2 rounded-full border border-cyan-400/60 animate-pulse" />
                  {/* Center dot */}
                  <div className="w-7 h-7 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-full shadow-[0_0_20px_rgba(56,189,248,0.8)] border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-950">
                    {calibrationPointIndex + 1}
                  </div>
                </div>
              </div>
            )
          )}

          {/* Floating Bottom Control Toolbar */}
          <div className="relative z-20 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 max-w-md w-full mb-2">
            <div className="flex items-center justify-between w-full text-xs text-slate-400 px-1">
              <span>{activeSet === "head" ? "Head" : "Eye"} calibration · Point {calibrationPointIndex + 1} of {points.length} ({currentPoint?.label})</span>
              <span>{capturedFrames}/{FRAMES_PER_POINT} frames</span>
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
              {!capturing && capturedFrames === 0 && (
                <button
                  onClick={captureCurrentPoint}
                  className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">{activeSet === "head" ? "screen_search_desktop" : "center_focus_strong"}</span>
                  {activeSet === "head" ? "Start Head Pose Capture" : "Start Capture Point"}
                </button>
              )}

              {capturing && (
                <div className="w-full py-2.5 bg-slate-800/80 border border-slate-700 text-white rounded-xl text-sm flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Recording {activeSet === "head" ? "head pose" : "gaze"} data ({capturedFrames}/{FRAMES_PER_POINT})...</span>
                </div>
              )}

              {!capturing && capturedFrames > 0 && (
                <button
                  onClick={nextPoint}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
                >
                  <span>{activeSet === "eye" && calibrationPointIndex >= points.length - 1 ? "Start Head Calibration" : calibrationPointIndex >= points.length - 1 ? "Complete Calibration" : "Next Point"}</span>
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              )}
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
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1 mt-2">
              <span className="material-symbols-outlined text-sm">
                lock
              </span>
              Encrypted Connection
            </p>
          </div>
        </>
      )}
    </div>
  );
}
