"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRuns } from "@/lib/api";

interface RunSummary {
  id: string;
  scenario_id: string;
  scenario_name: string;
  status: string;
  active_bugs: string[];
  created_at: string;
  finished_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  passed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRuns()
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Run History</h1>
          <p className="text-slate-400 mt-1">All scenario executions</p>
        </div>
        <button
          onClick={() => router.push("/scenarios")}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          New Run
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-16">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 mb-4">No runs yet.</p>
          <button
            onClick={() => router.push("/scenarios")}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Run your first scenario
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => router.push(`/runs/${run.id}`)}
              className="w-full text-left p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-slate-300">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="text-sm text-white font-medium">
                    {run.scenario_name}
                  </span>
                  {run.active_bugs.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                      {run.active_bugs.length} bug{run.active_bugs.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      STATUS_STYLES[run.status] || STATUS_STYLES.pending
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
