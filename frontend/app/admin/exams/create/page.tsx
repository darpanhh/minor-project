"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

interface Question {
  question: string;
  options: string[];
  correct_answer: number;
}

export default function CreateExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [questions, setQuestions] = useState<Question[]>([
    { question: "", options: ["", "", "", ""], correct_answer: 0 },
  ]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addQuestion() {
    setQuestions([...questions, { question: "", options: ["", "", "", ""], correct_answer: 0 }]);
  }

  function removeQuestion(idx: number) {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, value: string) {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], question: value };
    setQuestions(updated);
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    const updated = [...questions];
    updated[qIdx] = { ...updated[qIdx] };
    updated[qIdx].options[oIdx] = value;
    setQuestions(updated);
  }

  function updateCorrect(qIdx: number, oIdx: number) {
    const updated = [...questions];
    updated[qIdx] = { ...updated[qIdx], correct_answer: oIdx };
    setQuestions(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError("Title is required"); return; }
    if (!startTime) { setError("Start time is required"); return; }
    for (const q of questions) {
      if (!q.question.trim()) { setError("All questions must have text"); return; }
      for (const opt of q.options) {
        if (!opt.trim()) { setError("All options must be filled"); return; }
      }
    }

    setSubmitting(true);
    try {
      await api.createExam({
        title,
        start_time: new Date(startTime).toISOString(),
        duration_min: durationMin,
        questions,
      });
      router.push("/admin/exams");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ProtectedRoute role="admin">
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Create MCQ Exam</h1>
          <p className="text-sm text-slate-500 mt-1">Set up a new exam with questions and answers</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="content-card space-y-5">
            <h2 className="text-base font-semibold text-slate-900 pb-2 border-b border-slate-100">Exam Details</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Exam Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
                placeholder="e.g. Midterm Exam"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Time</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
                  required
                />
              </div>
            </div>
          </div>

          <div className="content-card space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Questions ({questions.length})
              </h2>
              <button
                type="button"
                onClick={addQuestion}
                className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Question
              </button>
            </div>

            {questions.map((q, qIdx) => (
              <div key={qIdx} className="border border-slate-200 rounded-xl p-5 space-y-4 animate-fade-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                      Question {qIdx + 1}
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your question"
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, e.target.value)}
                      className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
                      required
                    />
                  </div>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="btn-danger !py-1.5 !px-2.5 text-xs mt-5"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`correct-${qIdx}`}
                        id={`q${qIdx}-o${oIdx}`}
                        checked={q.correct_answer === oIdx}
                        onChange={() => updateCorrect(qIdx, oIdx)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer shrink-0"
                      />
                      <label htmlFor={`q${qIdx}-o${oIdx}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                            value={opt}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                            className={`input-focus w-full border rounded-lg px-3 py-2 text-sm ${
                              oIdx === q.correct_answer
                                ? "border-emerald-300 bg-emerald-50/50"
                                : "border-slate-300"
                            }`}
                            required
                          />
                          {oIdx === q.correct_answer && (
                            <span className="text-xs font-medium text-emerald-600 whitespace-nowrap bg-emerald-50 px-2 py-0.5 rounded-full">
                              Correct
                            </span>
                          )}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Creating...
              </>
            ) : (
              "Create Exam"
            )}
          </button>
        </form>
      </div>
    </ProtectedRoute>
  );
}
