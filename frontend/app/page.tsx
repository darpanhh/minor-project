"use client";

import { useAuth } from "@/src/contexts/AuthContext";
import Link from "next/link";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    const dashboard = user.role === "admin" ? "/admin/dashboard" : "/student/dashboard";
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="content-card max-w-md w-full text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-indigo-100 mx-auto mb-4 flex items-center justify-center text-indigo-600 text-2xl font-bold">
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-1">
            Welcome, {user.full_name}
          </h1>
          <p className="text-sm text-slate-500 mb-2">
            Logged in as <span className="font-medium text-slate-700 capitalize">{user.role}</span>
          </p>
          {user.registered_photo && (
            <img
              src={user.registered_photo}
              alt="Registered photo"
              className="w-24 h-24 object-cover rounded-full mx-auto mb-4 border-2 border-slate-200 shadow-sm"
            />
          )}
          <Link
            href={dashboard}
            className="btn-primary inline-block mt-2"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-lg animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg shadow-indigo-200">
            V
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Vision<span className="text-indigo-600">Proctor</span>
          </h1>
          <p className="text-lg text-slate-500 mb-8 leading-relaxed">
            AI-Powered Proctored Exam System with real-time face detection,
            gaze tracking, and suspicious activity monitoring.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/login" className="btn-primary text-base !py-3 !px-8">
              Login
            </Link>
            <Link href="/register" className="btn-secondary text-base !py-3 !px-8">
              Register
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-indigo-600">AI</div>
              <div className="text-xs text-slate-400 mt-1">Powered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">Live</div>
              <div className="text-xs text-slate-400 mt-1">Proctoring</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">Secure</div>
              <div className="text-xs text-slate-400 mt-1">Exams</div>
            </div>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-indigo-50 via-white to-slate-50 items-center justify-center p-12">
        <div className="max-w-sm space-y-6">
          <div className="content-card p-6 card-hover">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 mb-3">1</div>
            <h3 className="font-semibold text-slate-900 mb-1">Admin Creates Exam</h3>
            <p className="text-sm text-slate-500">Set up MCQ exams with questions, options, and correct answers.</p>
          </div>
          <div className="content-card p-6 card-hover">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3">2</div>
            <h3 className="font-semibold text-slate-900 mb-1">Student Takes Exam</h3>
            <p className="text-sm text-slate-500">Camera stays on throughout with AI proctoring monitoring.</p>
          </div>
          <div className="content-card p-6 card-hover">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 mb-3">3</div>
            <h3 className="font-semibold text-slate-900 mb-1">Review Reports</h3>
            <p className="text-sm text-slate-500">Admin reviews suspicion scores, alerts, and evidence.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
