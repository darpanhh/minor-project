"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/contexts/AuthContext";
import Link from "next/link";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(fullName, email, password, studentId || undefined, photo || undefined);
      router.push("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-lg font-bold mx-auto mb-4">
            V
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
          <p className="text-sm text-slate-500 mt-1">Register for the exam portal</p>
        </div>

        <form onSubmit={handleSubmit} className="content-card space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Student ID (optional)</label>
            <input
              type="text"
              placeholder="e.g. STU001"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="input-focus w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Face Photo</label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                id="photo-upload"
              />
              <label htmlFor="photo-upload" className="cursor-pointer">
                {preview ? (
                  <img src={preview} alt="Preview" className="w-28 h-28 object-cover rounded-lg mx-auto" />
                ) : (
                  <div className="py-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-500">Click to upload face photo</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-xs text-center text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
