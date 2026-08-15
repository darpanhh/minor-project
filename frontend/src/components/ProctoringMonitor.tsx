"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface Alert {
  type: string;
  message: string;
}

interface ActiveWarning {
  type: string;
  message: string;
  level: "warning" | "violation";
}

interface GazeData {
  face_detected: boolean;
  status: string;
  predicted_point: string | null;
  confidence: number;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  violation_active: boolean;
  violation_type: string | null;
  violation_duration: number;
}

interface ProctorResult {
  person_count: number;
  phone_detected: boolean;
  detections: Detection[];
  alerts: Alert[];
  active_warnings?: ActiveWarning[];
  snapshot_reasons: string[];
  snapshots?: string[];
  gaze?: GazeData;
}

const WS_BASE =
  process.env.NEXT_PUBLIC_PROCTOR_WS_URL || "ws://localhost:8000/ws/proctor";
const SEND_INTERVAL_MS = 1000;

interface ProctoringMonitorProps {
  sessionId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onAlert?: (alert: Alert) => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export default function ProctoringMonitor({
  sessionId,
  videoRef,
  onAlert,
}: ProctoringMonitorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const alertsRef = useRef<Alert[]>([]);
  const gazeRef = useRef<GazeData | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;
  const connectRef = useRef<(() => void) | null>(null);

  const [connected, setConnected] = useState(false);
  const [activeWarnings, setActiveWarnings] = useState<ActiveWarning[]>([]);
  const [mounted, setMounted] = useState(false);
  const [gazeStatus, setGazeStatus] = useState<string | null>("normal");
  const [gazeAngles, setGazeAngles] = useState<string>("");
  const [wsError, setWsError] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const drawOverlay = useCallback(
    (detections: Detection[]) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      detections.forEach((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        const isFlagged = d.label === "cell phone";
        ctx.strokeStyle = isFlagged ? "#ef4444" : "#22c55e";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = "14px sans-serif";
        ctx.fillText(
          `${d.label} ${(d.confidence * 100).toFixed(0)}%`,
          x1,
          y1 > 15 ? y1 - 5 : y1 + 15
        );
      });

      const gaze = gazeRef.current;
      if (!gaze) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const cx = cw / 2;
      const cy = ch / 2;

      if (!gaze.face_detected) {
        ctx.fillStyle = "rgba(239,68,68,0.20)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⚠ NO FACE DETECTED", cx, cy);
        ctx.textAlign = "start";
        return;
      }

      const violation = gaze.violation_active && gaze.status !== "normal";
      const baseColor = violation ? "#ef4444" : "#22c55e";

      // ── Status badge (top-right) ─────────────────────────────
      {
        const statusColor =
          gaze.status === "normal" ? "#22c55e" :
          gaze.status === "looking_off_screen" ? "#6b7280" : "#ef4444";
        ctx.fillStyle = statusColor;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(cw - 170, 8, 162, 26);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(gaze.status.replace(/_/g, " ").toUpperCase(), cw - 162, 27);
      }

      // ── Head outline (ellipse) ───────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.14, ch * 0.30, 0, 0, Math.PI * 2);
      ctx.stroke();

      // ── Gaze direction arrow + dot ───────────────────────────
      if (gaze.yaw !== null && gaze.pitch !== null) {
        const displayYaw = -gaze.yaw;
        const displayPitch = -gaze.pitch;
        const scale = Math.max(cw, ch) / 100;
        const gx = cx + displayYaw * scale;
        const gy = cy + displayPitch * scale;
        const clampedGx = Math.max(10, Math.min(cw - 10, gx));
        const clampedGy = Math.max(10, Math.min(ch - 10, gy));

        // Crosshair at centre
        ctx.strokeStyle = "rgba(255,255,255,0.20)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
        ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow shaft
        ctx.strokeStyle = baseColor;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(clampedGx, clampedGy);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Arrowhead
        const angle = Math.atan2(clampedGy - cy, clampedGx - cx);
        const headLen = 12;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(clampedGx, clampedGy);
        ctx.lineTo(
          clampedGx - headLen * Math.cos(angle - 0.4),
          clampedGy - headLen * Math.sin(angle - 0.4),
        );
        ctx.lineTo(
          clampedGx - headLen * Math.cos(angle + 0.4),
          clampedGy - headLen * Math.sin(angle + 0.4),
        );
        ctx.closePath();
        ctx.fill();

        // Dot at destination
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(clampedGx, clampedGy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // ── Looking-at label (top-left, large) ───────────────────
      {
        const zone = gaze.predicted_point || "center";
        const isNormal = gaze.status === "normal" && !violation;
        ctx.fillStyle = isNormal ? "rgba(34,197,94,0.90)" : "rgba(239,68,68,0.90)";
        ctx.font = "bold 15px sans-serif";
        const label = `Looking: ${zone.replace(/_/g, " ")} ${isNormal ? "✓" : "⚠"}`;
        ctx.fillText(label, 10, 30);

        // Confidence bar
        const barX = 10;
        const barY = 40;
        const barW = 120;
        const barH = 6;
        ctx.fillStyle = "rgba(255,255,255,0.20)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = isNormal ? "#22c55e" : "#f59e0b";
        ctx.fillRect(barX, barY, barW * gaze.confidence, barH);
        ctx.fillStyle = "rgba(255,255,255,0.60)";
        ctx.font = "10px sans-serif";
        ctx.fillText(`${(gaze.confidence * 100).toFixed(0)}%`, barX + barW + 6, barY + 6);
      }

      // ── Angle readout (bottom-left corner) ───────────────────
      if (gaze.yaw !== null && gaze.pitch !== null) {
        ctx.fillStyle = "rgba(255,255,255,0.70)";
        const yOff = ch - 60;

        const hDir = gaze.yaw > 12 ? "← LEFT" : gaze.yaw < -12 ? "RIGHT →" : "CENTER";
        const vDir = gaze.pitch > 12 ? "↑ UP" : gaze.pitch < -12 ? "↓ DOWN" : "—";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(`${hDir}  ${vDir}`, 10, yOff);

        ctx.font = "11px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.50)";
        ctx.fillText(
          `yaw ${gaze.yaw >= 0 ? "+" : ""}${gaze.yaw.toFixed(0)}°  ` +
          `pitch ${gaze.pitch >= 0 ? "+" : ""}${gaze.pitch.toFixed(0)}°  ` +
          `roll ${gaze.roll !== null ? (gaze.roll >= 0 ? "+" : "") + gaze.roll.toFixed(0) : "?"}°`,
          10, yOff + 16,
        );
      }
    },
    [videoRef]
  );

  const buildUrl = useCallback(() => {
    let tokenParam = "";
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
    }

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

        const isLocalBackend = urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1";
        if (isLocalBackend) {
          urlObj.hostname = window.location.hostname;
        }

        wsUrl = urlObj.toString();
      } catch {
        const scheme = window.location.protocol === "https:" ? "wss" : "ws";
        wsUrl = `${scheme}://${window.location.hostname}:8000/ws/proctor`;
      }
    }
    return `${wsUrl}/${sessionId}${tokenParam}`;
  }, [sessionId]);

  const connect = useCallback(function connectFn() {
    if (!mountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);

    try {
      const ws = new WebSocket(buildUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setConnected(true);
        setWsError(false);
        setFatalError(null);
        reconnectAttemptRef.current = 0;
      };

      ws.onclose = (e) => {
        if (!mountedRef.current) return;
        setConnected(false);
        setActiveWarnings([]);

        console.warn("Proctor WS closed: code=%d reason=%s", e.code, e.reason);

        if (e.code === 1000) return;

        if (e.code >= 4000) {
          setFatalError(`Server rejected connection (code ${e.code})`);
          return;
        }

        setWsError(true);
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current),
            RECONNECT_MAX_MS
          );
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connectFn, delay);
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        setActiveWarnings([]);
        setWsError(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            setFatalError(data.error);
            ws.close();
            return;
          }

          const result = data as ProctorResult;
          drawOverlay(result.detections);

          if (result.active_warnings) {
            setActiveWarnings(result.active_warnings);
          }

          if (result.gaze) {
            gazeRef.current = result.gaze;
            setGazeStatus(result.gaze.status);
            if (result.gaze.yaw !== null && result.gaze.pitch !== null) {
              setGazeAngles(
                `Y${result.gaze.yaw >= 0 ? "+" : ""}${result.gaze.yaw.toFixed(0)} ` +
                `P${result.gaze.pitch >= 0 ? "+" : ""}${result.gaze.pitch.toFixed(0)} ` +
                `R${result.gaze.roll !== null ? (result.gaze.roll >= 0 ? "+" : "") + result.gaze.roll.toFixed(0) : "?"}`
              );
            } else {
              setGazeAngles("");
            }
          }

          for (const alert of result.alerts) {
            const alreadyShown = alertsRef.current.some((a) => a.type === alert.type && a.message === alert.message);
            if (!alreadyShown) {
              alertsRef.current = [alert, ...alertsRef.current].slice(0, 30);
              onAlertRef.current?.(alert);
            }
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      if (!mountedRef.current) return;
      setWsError(true);
      setConnected(false);
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttemptRef.current),
          RECONNECT_MAX_MS
        );
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connectFn, delay);
      }
    }
  }, [buildUrl, drawOverlay]);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    reconnectAttemptRef.current = 0;
    connectRef.current?.();

    setMounted(true);

    return () => {
      mountedRef.current = false;
      setMounted(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (wsError || fatalError) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const ws = wsRef.current;
      if (
        !video ||
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        video.videoWidth === 0
      )
        return;

      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const ctx = captureCanvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.6);
      ws.send(JSON.stringify({ frame: dataUrl }));
    }, SEND_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [videoRef, wsError, fatalError]);

  return (
    <div className="w-full">
      {/* ── Main-screen warning overlay (over the exam, not below the camera) ── */}
      {mounted &&
        activeWarnings.length > 0 &&
        createPortal(
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,640px)] space-y-2 pointer-events-none">
            {activeWarnings.map((w) => (
              <div
                key={w.type}
                role="alert"
                className={`w-full px-5 py-4 rounded-2xl shadow-2xl border-2 font-bold text-sm sm:text-base text-center flex items-center justify-center gap-2.5 ${
                  w.level === "violation"
                    ? "bg-red-600 border-red-400 text-white"
                    : "bg-amber-400 border-amber-300 text-amber-950"
                }`}
              >
                <span className="material-symbols-outlined text-xl shrink-0">
                  {w.level === "violation" ? "gavel" : "warning"}
                </span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>,
          document.body
        )}

      <div className="relative w-full aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full rounded-lg bg-black object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {fatalError ? (
          <span className="text-red-600">AI Proctor: {fatalError}</span>
        ) : wsError ? (
          <span className="text-yellow-600">AI Proctor unavailable — reconnecting...</span>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className={connected ? "text-green-600" : "text-red-600"}>
                AI Proctor: {connected ? "Connected" : "Disconnected"}
              </span>
            </span>

            {gazeStatus && (() => {
              const gaze = gazeRef.current;
              const pt = gaze?.predicted_point;
              const conf = gaze?.confidence ?? 0;
              const isNormal = gazeStatus === "normal";
              return (
                <>
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      isNormal ? "bg-green-500" :
                      gazeStatus === "looking_off_screen" ? "bg-gray-500" : "bg-red-500"
                    }`} />
                    <span className={isNormal ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {isNormal ? "Normal" : gazeStatus.replace(/_/g, " ")}
                    </span>
                  </span>
                  {pt && (
                    <span className="text-gray-500">
                      {pt === "center" ? "Center ✓" : pt.replace(/_/g, " ") + " ⚠"}
                    </span>
                  )}
                  <span className="text-gray-400">{(conf * 100).toFixed(0)}%</span>
                  {gazeAngles && (
                    <span className="text-gray-400 font-mono">{gazeAngles}</span>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
