"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const upcomingExams = [
  {
    id: "1",
    title: "Advanced Neural Networks",
    subject: "Artificial Intelligence",
    date: "2024-12-20",
    duration: 120,
    status: "published",
  },
  {
    id: "2",
    title: "Data Ethics & Privacy",
    subject: "Data Ethics",
    date: "2024-12-22",
    duration: 90,
    status: "published",
  },
];

export default function StudentDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Student Dashboard</h2>
        <p className="text-muted-foreground">Welcome back! Ready for your next exam?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Upcoming Exams</span>
            <span className="material-symbols-outlined text-primary">quiz</span>
          </div>
          <p className="text-2xl font-bold">3</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Completed</span>
            <span className="material-symbols-outlined text-primary">check_circle</span>
          </div>
          <p className="text-2xl font-bold">12</p>
        </div>
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Avg. Score</span>
            <span className="material-symbols-outlined text-primary">analytics</span>
          </div>
          <p className="text-2xl font-bold">85%</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Upcoming Exams</h3>
        {upcomingExams.map((exam) => (
          <Card key={exam.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <h4 className="font-medium">{exam.title}</h4>
                <p className="text-sm text-muted-foreground">{exam.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {exam.date} · {exam.duration} min
                </p>
              </div>
              <Link href={`/student/exams/${exam.id}/verify`}>
                <Button size="sm">Start Exam</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
