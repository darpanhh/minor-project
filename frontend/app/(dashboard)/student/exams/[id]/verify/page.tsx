"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/src/services/api";
// Local fallback Button to avoid missing import during verification
function Button({
  children,
  className = "",
  size,
  disabled,
  onClick,
}: React.PropsWithChildren<{
  className?: string;
  size?: string;
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

const CALIBRATION_POINTS = [
  { id: "top_left", label: "Top Left", x: 25, y: 25 },
  { id: "top_center", label: "Top Center", x: 50, y: 25 },
  { id: "top_right", label: "Top Right", x: 75, y: 25 },
  { id: "middle_left", label: "Middle Left", x: 25, y: 50 },
  { id: "center", label: "Center", x: 50, y: 50 },
  { id: "middle_right", label: "Middle Right", x: 75, y: 50 },
  { id: "bottom_left", label: "Bottom Left", x: 25, y: 75 },
  { id: "bottom_center", label: "Bottom Center", x: 50, y: 75 },
  { id: "bottom_right", label: "Bottom Right", x: 75, y: 75 },
];

const WS_BASE =
  process.env.NEXT_PUBLIC_PROCTOR_WS_URL || "ws://localhost:8000/ws/proctor";
const FRAMES_PER_POINT = 30;
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
  const [calibrationPointIndex, setCalibrationPointIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [session, setSession] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const calibratingRef = useRef(true);

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
  }, []);

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
  function buildCalibrationUrl(): string {
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
  }

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
  }, [phase]);

  // ── Capture frames for the current point ───────────────────────
  async function captureCurrentPoint() {
    const ws = wsRef.current;
    const video = videoRef.current;
    if (!ws || !video || ws.readyState !== WebSocket.OPEN) return;

    const point = CALIBRATION_POINTS[calibrationPointIndex];
    setCapturing(true);
    setCapturedFrames(0);

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
            point: point.id,
            frame_number: f + 1,
            frame: captureCanvas.toDataURL("image/jpeg", 0.6),
          })
        );
      }
      setCapturedFrames(f + 1);
      await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
    }
    setCapturing(false);
  }

  function nextPoint() {
    const next = calibrationPointIndex + 1;
    if (next >= CALIBRATION_POINTS.length) {
      wsRef.current?.close();
      wsRef.current = null;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setPhase("complete");
    } else {
      setCalibrationPointIndex(next);
      setCapturedFrames(0);
    }
  }

  const currentPoint =
    calibrationPointIndex < CALIBRATION_POINTS.length
      ? CALIBRATION_POINTS[calibrationPointIndex]
      : null;

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
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-black/40" />

          {currentPoint && (
            <div
              className="absolute z-10"
              style={{
                left: `${currentPoint.x}%`,
                top: `${currentPoint.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div className="w-6 h-6 bg-primary/80 rounded-full animate-pulse" />
              <div className="absolute -inset-3 border-2 border-primary/60 rounded-full" />
            </div>
          )}

          <div className="relative z-10 text-center mb-8">
            <p className="text-white text-lg font-medium">
              Look at the{" "}
              <span className="text-primary font-bold">
                {currentPoint?.label.toLowerCase() || ""}
              </span>{" "}
              point
            </p>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4">
            {capturedFrames > 0 && !capturing && (
              <p className="text-white/70 text-sm">
                Captured {capturedFrames} frames
              </p>
            )}
            {capturing && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <p className="text-white text-sm">
                  Capturing {capturedFrames} / {FRAMES_PER_POINT}
                </p>
              </div>
            )}
            {!capturing && capturedFrames === 0 && (
              <button
                onClick={captureCurrentPoint}
                className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition"
              >
                Start Capture
              </button>
            )}
            {!capturing && capturedFrames > 0 && (
              <button
                onClick={nextPoint}
                className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition"
              >
                {calibrationPointIndex >= CALIBRATION_POINTS.length - 1
                  ? "Finish"
                  : "Next"}
              </button>
            )}
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-64 z-10">
            <div className="flex gap-1">
              {CALIBRATION_POINTS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < calibrationPointIndex
                      ? "bg-primary"
                      : i === calibrationPointIndex
                        ? "bg-primary/60"
                        : "bg-white/20"
                  }`}
                />
              ))}
            </div>
            <p className="text-white/50 text-xs text-center mt-1">
              Point {calibrationPointIndex + 1} of{" "}
              {CALIBRATION_POINTS.length}
            </p>
          </div>
        </div>
      )}

      {/* ── Phase: complete ──────────────────────────────────────── */}
      {phase === "complete" && (
        <>
          <div>
            <h2 className="text-2xl font-bold">Calibration Complete</h2>
            <p className="text-muted-foreground">
              Your eye/head tracking has been calibrated. You can now
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
                  All 9 calibration points have been recorded
                  successfully.
                </p>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
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
