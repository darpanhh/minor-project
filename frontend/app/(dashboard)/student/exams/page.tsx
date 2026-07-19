"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const exams = [
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
  {
    id: "3",
    title: "Linear Algebra Fundamentals",
    subject: "Mathematics",
    date: "2024-12-25",
    duration: 60,
    status: "published",
  },
];

export default function StudentExamsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Exams</h2>
        <p className="text-muted-foreground">View and start your upcoming exams</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exams.map((exam) => (
          <Card key={exam.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{exam.title}</h4>
                  <p className="text-sm text-muted-foreground">{exam.subject}</p>
                </div>
                <span className="material-symbols-outlined text-primary">quiz</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
                {exam.date}
                <span className="material-symbols-outlined text-sm ml-2">schedule</span>
                {exam.duration} min
              </div>
              <Link href={`/student/exams/${exam.id}/verify`}>
                <Button size="sm" className="w-full">
                  Start Exam
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
