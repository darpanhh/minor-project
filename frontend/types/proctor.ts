export interface ProctoringEvent {
  id: string;
  exam_session_id: string;
  event_type:
    | "tab_switch"
    | "face_verification"
    | "multiple_persons"
    | "phone_detected"
    | "gaze_away"
    | "no_person"
    | "voice_detected";
  severity: "info" | "warning" | "critical";
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  screenshot_url?: string;
}

export interface ProctoringSession {
  id: string;
  exam_id: string;
  student_id: string;
  status: "active" | "completed" | "flagged" | "terminated";
  started_at: string;
  ended_at?: string;
  integrity_score: number;
  events: ProctoringEvent[];
}

export interface FaceVerificationResult {
  verified: boolean;
  confidence: number;
  landmarks: number;
  message: string;
}

export interface PersonDetectionResult {
  person_present: boolean;
  person_count: number;
  persons_detected?: Array<{ bbox: number[]; confidence: number }>;
  alert: boolean;
}

export interface GazeDetectionResult {
  looking_away: boolean;
  gaze_direction: string;
  duration_ms: number;
  confidence: number;
}

export interface PhoneDetectionResult {
  phone_detected: boolean;
  confidence: number;
  bbox?: number[];
}

export interface VoiceDetectionResult {
  voice_detected: boolean;
  confidence: number;
  duration_ms: number;
}
