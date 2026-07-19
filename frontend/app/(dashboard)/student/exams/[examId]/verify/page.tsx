"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: "pending" | "in_progress" | "complete" | "error";
}

export default function VerifyPage() {
  const params = useParams();
  const router = useRouter();
  const [checks, setChecks] = useState<CheckItem[]>([
    { id: "camera", label: "Camera Access", description: "High-definition enabled", icon: "videocam", status: "pending" },
    { id: "audio", label: "Audio Check", description: "System default input active", icon: "mic", status: "pending" },
    { id: "face", label: "Identity Match", description: "Biometric verification", icon: "badge", status: "pending" },
    { id: "room", label: "Room Scan", description: "Detecting surroundings...", icon: "room_preferences", status: "pending" },
  ]);
  const [allComplete, setAllComplete] = useState(false);

  useEffect(() => {
    const runChecks = async () => {
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
      setAllComplete(true);
    };
    runChecks();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
          Please ensure your face is clearly visible and centered in the frame.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-1">Identity Verification</h3>
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
                  <span className="material-symbols-outlined">{check.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="text-xs text-muted-foreground">{check.description}</p>
                </div>
              </div>
              {check.status === "complete" && (
                <span className="material-symbols-outlined text-primary">check_circle</span>
              )}
              {check.status === "in_progress" && (
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              )}
              {check.status === "pending" && (
                <span className="material-symbols-outlined text-muted-foreground">radio_button_unchecked</span>
              )}
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!allComplete}
          onClick={() => router.push(`/student/exams/${params.examId}`)}
        >
          <span>Start Exam</span>
          <span className="material-symbols-outlined ml-2">arrow_forward</span>
        </Button>
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1 mt-2">
          <span className="material-symbols-outlined text-sm">lock</span>
          Encrypted Connection
        </p>
      </div>
    </div>
  );
}
