export interface ExamResult {
  id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  student_name: string;
  score: number;
  total_marks: number;
  percentage: number;
  time_spent_minutes: number;
  status: "passed" | "failed" | "under_review";
  integrity_score: number;
  submitted_at: string;
}

export interface QuestionResult {
  question_id: string;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  marks_obtained: number;
  marks_total: number;
}

export interface ProctoringLog {
  id: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  screenshot_url?: string;
}
