"use client";

import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const results = [
  { id: "r1", exam: "Advanced Neural Networks", score: 85, total: 100, percentage: 85, status: "passed", integrity: 98, date: "2024-12-15" },
  { id: "r2", exam: "Data Ethics & Privacy", score: 72, total: 100, percentage: 72, status: "passed", integrity: 95, date: "2024-12-10" },
  { id: "r3", exam: "Linear Algebra", score: 45, total: 100, percentage: 45, status: "failed", integrity: 88, date: "2024-12-05" },
];

export default function StudentResultsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Results</h2>
        <p className="text-muted-foreground">View your exam performance and proctoring integrity</p>
      </div>

      <div className="space-y-4">
        {results.map((result) => (
          <div key={result.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <h4 className="font-medium">{result.exam}</h4>
              <p className="text-sm text-muted-foreground">{result.date}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{result.score}/{result.total}</p>
              <p className="text-sm text-muted-foreground">{result.percentage}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
