const API_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:8000/api`
  : "http://localhost:8000/api";

export function serverUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000";
  return `${base}${path}`;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("access_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("access_token", token);
      else localStorage.removeItem("access_token");
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      const detail = Array.isArray(err.detail) ? err.detail.map((d: any) => d.msg).join("; ") : err.detail;
      throw new Error(detail || `Request failed with status ${res.status}`);
    }

    return res.json();
  }

  private async requestForm<T>(method: string, path: string, form: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      const detail = Array.isArray(err.detail) ? err.detail.map((d: any) => d.msg).join("; ") : err.detail;
      throw new Error(detail || `Request failed with status ${res.status}`);
    }
    return res.json();
  }

  // --- Exams ---
  createExam(data: { title: string; start_time: string; duration_min: number; questions: { question: string; options: string[]; correct_answer: number }[] }) {
    return this.request<any>("POST", "/exams", data);
  }

  listExams() {
    return this.request<any[]>("GET", "/exams");
  }

  getExam(id: string) {
    return this.request<any>("GET", `/exams/${id}`);
  }

  deleteExam(id: string) {
    return this.request<void>("DELETE", `/exams/${id}`);
  }

  registerForExam(examId: string) {
    return this.request<any>("POST", `/exams/${examId}/register`);
  }

  mySessionForExam(examId: string) {
    return this.request<any | null>("GET", `/exams/${examId}/sessions/me`);
  }

  // --- Sessions ---
  startSession(sessionId: string) {
    return this.request<any>("POST", `/sessions/${sessionId}/start`);
  }

  submitSession(sessionId: string, answers: Record<string, number>) {
    return this.request<any>("POST", `/sessions/${sessionId}/submit`, { answers });
  }

  getSession(sessionId: string) {
    return this.request<any>("GET", `/sessions/${sessionId}`);
  }

  logProctoringEvent(sessionId: string, eventType: string, confidence: number = 0, snapshot?: string) {
    return this.request<any>("POST", `/sessions/${sessionId}/events`, {
      event_type: eventType,
      confidence,
      snapshot: snapshot || null,
    });
  }

  getSessionEvents(sessionId: string) {
    return this.request<any[]>("GET", `/sessions/${sessionId}/events`);
  }

  // --- Student specific ---
  myExams() {
    return this.request<any[]>("GET", "/my/exams");
  }

  mySessions() {
    return this.request<any[]>("GET", "/my/sessions");
  }

  mySessionDetail(sessionId: string) {
    return this.request<any>("GET", `/my/sessions/${sessionId}`);
  }

  // --- Admin ---
  listAlerts() {
    return this.request<any[]>("GET", "/admin/alerts");
  }

  reviewAlert(alertId: string) {
    return this.request<any>("POST", `/admin/alerts/${alertId}/review`);
  }

  listAllSessions() {
    return this.request<any[]>("GET", "/admin/sessions");
  }

  getAdminSessionDetail(sessionId: string) {
    return this.request<any>("GET", `/admin/sessions/${sessionId}`);
  }

  gradeSession(sessionId: string, finalScore: number, notes?: string) {
    return this.request<any>("POST", `/admin/sessions/${sessionId}/grade`, {
      final_score: finalScore,
      notes: notes || null,
    });
  }

  async register(data: { full_name: string; email: string; password: string; student_id?: string; photo?: File }) {
    const form = new FormData();
    form.append("full_name", data.full_name);
    form.append("email", data.email);
    form.append("password", data.password);
    if (data.student_id) form.append("student_id", data.student_id);
    if (data.photo) form.append("photo", data.photo);

    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers,
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(err.detail || `Request failed with status ${res.status}`);
    }
    return res.json();
  }

  login(data: { email: string; password: string }) {
    return this.request<{ access_token: string; refresh_token: string; token_type: string; user: any }>("POST", "/auth/login", data);
  }

  me() {
    return this.request<{ id: string; full_name: string; email: string; role: string; student_id: string | null; registered_photo: string | null; created_at: string }>("GET", "/auth/me");
  }

  refresh(refreshToken: string) {
    return this.request<{ access_token: string; token_type: string }>("POST", "/auth/token/refresh", { refresh_token: refreshToken });
  }
}

export const api = new ApiClient();
