"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const questions = [
  { id: "q1", text: "What is a neural network?", options: ["A type of computer network", "A machine learning model inspired by the brain", "A database system", "A programming language"], marks: 5 },
  { id: "q2", text: "Which activation function is commonly used in hidden layers?", options: ["Linear", "Sigmoid", "ReLU", "Softmax"], marks: 5 },
  { id: "q3", text: "What does backpropagation do?", options: ["Forwards data", "Updates weights", "Initializes network", "Augments data"], marks: 5 },
];

export default function ExamTakingPage() {
  const params = useParams();
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(7200);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleAnswer = (optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [currentQ]: optionIdx }));
  };

  const question = questions[currentQ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Advanced Neural Networks</h2>
          <p className="text-sm text-muted-foreground">Question {currentQ + 1} of {questions.length}</p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-mono font-bold ${timeLeft < 300 ? "text-destructive" : "text-primary"}`}>
            {formatTime(timeLeft)}
          </div>
          <p className="text-xs text-muted-foreground">Time remaining</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Question {currentQ + 1} of {questions.length}</p>
            <h3 className="text-lg font-medium">{question.text}</h3>
          </div>
          <span className="text-sm text-muted-foreground">5 marks</span>
        </div>

        <div className="space-y-3">
          {question.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => setAnswers((prev) => ({ ...prev, [currentQ]: idx }))}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                answers[currentQ] === idx
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="text-sm font-medium">{option}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
            disabled={currentQ === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentQ + 1} / {questions.length}
          </span>
          {currentQ < questions.length - 1 ? (
            <Button onClick={() => setCurrentQ((q) => q + 1)}>Next</Button>
          ) : (
            <Button onClick={() => router.push("/student/results")}>Submit</Button>
          )}
        </div>
      </div>
    </div>
  );
}
