export interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string;
  total_marks: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: "draft" | "published" | "in_progress" | "completed";
  created_by: string;
  created_at: string;
  questions?: Question[];
  proctoring_settings?: ProctoringSettings;
}

export interface Question {
  id: string;
  exam_id: string;
  text: string;
  type: "mcq" | "true_false" | "short_answer";
  options?: string[];
  correct_answer: string;
  marks: number;
  order: number;
}

export interface CreateExamRequest {
  title: string;
  subject: string;
  description: string;
  total_marks: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  questions: CreateQuestionRequest[];
  proctoring_settings?: ProctoringSettings;
}

export interface CreateQuestionRequest {
  text: string;
  type: "mcq" | "true_false" | "short_answer";
  options?: string[];
  correct_answer: string;
  marks: number;
}

export interface ProctoringSettings {
  face_verification: boolean;
  tab_lockout: "off" | "moderate" | "strict";
  voice_detection: boolean;
  multiple_person_detection: boolean;
  phone_detection: boolean;
  gaze_detection: boolean;
}
