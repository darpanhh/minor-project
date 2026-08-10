"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

const exams = [
  { id: "1", title: "Advanced Neural Networks", subject: "AI", questions: 25, status: "published", date: "2024-12-20" },
  { id: "2", title: "Data Ethics & Privacy", subject: "Data Ethics", questions: 20, status: "draft", date: "2024-12-22" },
  { id: "3", title: "Linear Algebra", subject: "Mathematics", questions: 15, status: "published", date: "2024-12-25" },
];

export default function TeacherExamsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exam Management</h2>
          <p className="text-muted-foreground">Create and manage your exams</p>
        </div>
        <Link href="/teacher/exams/create">
          <Button>Create Exam</Button>
        </Link>
      </div>

      <div className="space-y-4">
        {exams.map((exam) => (
          <div key={exam.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <h4 className="font-medium">{exam.title}</h4>
              <p className="text-sm text-muted-foreground">{exam.subject} · {exam.questions} questions</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                exam.status === "published" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {exam.status}
              </span>
              <Link href={`/teacher/exams/${exam.id}`}>
                <button className="text-sm text-primary hover:underline">View</button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
