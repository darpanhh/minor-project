"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/src/services/api";
import ProtectedRoute from "@/src/components/ProtectedRoute";

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    tab_switch: "bg-amber-100 text-amber-700",
    multiple_faces: "bg-red-100 text-red-700",
    person_absent: "bg-red-100 text-red-700",
    identity_mismatch: "bg-red-100 text-red-700",
    phone_detected: "bg-orange-100 text-orange-700",
    object_detected: "bg-orange-100 text-orange-700",
    gaze_away: "bg-slate-100 text-slate-700",
    head_pose_abnormal: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${colors[type] || "bg-slate-100 text-slate-700"}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.getAdminSessionDetail(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ProtectedRoute role="admin">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="skeleton h-6 w-32 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!data) {
    return (
      <ProtectedRoute role="admin">
        <div className="p-6 text-center"><p className="text-red-600">Session not found</p></div>
      </ProtectedRoute>
    );
  }

  const { session, events, alerts, cheating_logs } = data;

  return (
    <ProtectedRoute role="admin">
      <div className="p-6 max-w-5xl mx-auto animate-fade-in">
        <Link href="/admin/reports" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Reports
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Student Report</h1>
          <span className={`status-badge ${
            session.status === "submitted" ? "status-badge--success" :
            session.status === "in_progress" ? "status-badge--info" :
            session.status === "flagged" ? "status-badge--danger" : "status-badge--default"
          }`}>{session.status}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Student</p>
            <p className="font-semibold text-slate-900">{session.student_name}</p>
            <p className="text-sm text-slate-500">{session.student_email}</p>
            {session.student_display_id && (
              <p className="text-xs text-slate-400 mt-0.5">ID: {session.student_display_id}</p>
            )}
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Exam</p>
            <p className="font-semibold text-slate-900">{session.exam_title}</p>
            {session.started_at && (
              <p className="text-xs text-slate-400 mt-1">
                {new Date(session.started_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Exam Score</p>
            <p className={`text-3xl font-bold ${
              session.score != null && session.score >= 60 ? "text-emerald-600" :
              session.score != null && session.score >= 40 ? "text-amber-600" :
              session.score != null ? "text-red-600" : "text-slate-400"
            }`}>
              {session.score != null ? `${Math.round(session.score)}%` : "N/A"}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Suspicion Score</p>
            <div className="mt-1">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ${
                      session.suspicion_score >= 85 ? "bg-red-500" :
                      session.suspicion_score >= 60 ? "bg-amber-500" :
                      session.suspicion_score >= 30 ? "bg-orange-400" :
                      "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(session.suspicion_score || 0, 100)}%` }}
                  />
                </div>
                <span className="text-xl font-bold text-slate-900">
                  {Math.round(session.suspicion_score || 0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Proctoring Events", value: events?.length || 0, color: "", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
            { label: "Alerts", value: alerts?.length || 0, color: "text-amber-600", icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
            { label: "Cheating Logs", value: cheating_logs?.length || 0, color: "text-red-600", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
            { label: "Tab Switches", value: events?.filter((e: any) => e.event_type === "tab_switch").length || 0, color: "text-amber-600", icon: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" },
          ].map((item, i) => (
            <div key={i} className="text-center border border-slate-200 rounded-xl p-4">
              <p className={`text-2xl font-bold ${item.color || "text-slate-900"}`}>{item.value}</p>
              <p className="text-xs text-slate-500 mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {session.started_at && (
          <div className="flex items-center gap-6 text-sm text-slate-500 mb-6 bg-slate-50 rounded-xl px-4 py-3">
            <span>Started: {new Date(session.started_at).toLocaleString()}</span>
            {session.submitted_at && <span>Submitted: {new Date(session.submitted_at).toLocaleString()}</span>}
            {session.started_at && session.submitted_at && (
              <span>Duration: {Math.round((new Date(session.submitted_at).getTime() - new Date(session.started_at).getTime()) / 60000)} min</span>
            )}
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <div className="content-card mb-8">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Alerts ({alerts.length})</h2>
            <div className="space-y-2">
              {alerts.map((a: any) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border ${
                    a.severity === "high" ? "border-red-200 bg-red-50/50" :
                    a.severity === "medium" ? "border-amber-200 bg-amber-50/50" :
                    "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      a.severity === "high" ? "bg-red-500" :
                      a.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
                    }`} />
                    <span className={`status-badge ${
                      a.severity === "high" ? "status-badge--danger" :
                      a.severity === "medium" ? "status-badge--warning" : "status-badge--default"
                    }`}>{a.severity}</span>
                    <span className="text-sm font-medium text-slate-700">
                      Suspicion: {Math.round(a.suspicion_score)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
                    {!a.reviewed && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Unreviewed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="content-card mb-8">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Proctoring Events ({events?.length || 0})</h2>
          {events?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Event Type</th>
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Confidence</th>
                    <th className="text-left py-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e: any) => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 pr-4"><EventBadge type={e.event_type} /></td>
                      <td className="py-3 pr-4 text-sm text-slate-700">{(e.confidence * 100).toFixed(0)}%</td>
                      <td className="py-3 pr-4 text-sm text-slate-400">{new Date(e.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">No events recorded</p>
          )}
        </div>

        {cheating_logs && cheating_logs.length > 0 && (
          <div className="content-card">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Cheating Evidence ({cheating_logs.length})</h2>
            <div className="space-y-3">
              {cheating_logs.map((c: any) => (
                <div key={c.id} className="border border-red-200 bg-red-50/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Evidence</span>
                    <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  {c.description && <p className="text-sm text-slate-700 mb-2">{c.description}</p>}
                  {c.evidence_path && (
                    <a href={c.evidence_path} target="_blank" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View Evidence
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
