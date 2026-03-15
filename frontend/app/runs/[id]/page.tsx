"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRun, getRunStreamUrl, getScreenshotUrl } from "@/lib/api";

interface Step {
  id: string;
  step_index: number;
  name: string;
  status: string;
  screenshot_path: string | null;
  console_errors: string[];
  network_errors: any[];
  detail: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface Run {
  id: string;
  scenario_id: string;
  status: string;
  active_bugs: string[];
  started_at: string | null;
  finished_at: string | null;
  steps: Step[];
  triage: any | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  error: "Error",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◉",
  passed: "✓",
  failed: "✗",
  skipped: "–",
  error: "!",
};

export default function RunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;
  const [run, setRun] = useState<Run | null>(null);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<string>("");
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getRun(runId).then(setRun).catch(console.error);

    const es = new EventSource(getRunStreamUrl(runId));

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "init") {
        setRun({ ...data.run, steps: data.steps, triage: null });
        // Show last available screenshot
        const lastWithScreenshot = [...data.steps]
          .reverse()
          .find((s: Step) => s.screenshot_path);
        if (lastWithScreenshot) {
          setActiveScreenshot(lastWithScreenshot.screenshot_path);
          setActiveStepIndex(lastWithScreenshot.step_index);
        }
        return;
      }

      if (data.type === "step_update") {
        setRun((prev) => {
          if (!prev) return prev;
          const steps = prev.steps.map((s) =>
            s.step_index === data.stepIndex
              ? {
                  ...s,
                  status: data.status,
                  screenshot_path: data.screenshotPath || s.screenshot_path,
                  console_errors: data.consoleErrors || s.console_errors,
                  network_errors: data.networkErrors || s.network_errors,
                  detail: data.detail || s.detail,
                }
              : s
          );
          return { ...prev, steps };
        });

        if (data.status === "running") {
          setCurrentAction(data.name || "");
        }
        if (data.screenshotPath) {
          setActiveScreenshot(data.screenshotPath);
          setActiveStepIndex(data.stepIndex);
        }
      }

      if (data.type === "run_status") {
        setRun((prev) => (prev ? { ...prev, status: data.status } : prev));
        if (data.status !== "running") {
          setCurrentAction("");
        }
      }

      if (data.type === "triage_ready") {
        setRun((prev) => (prev ? { ...prev, triage: data.triage } : prev));
      }
    };

    return () => es.close();
  }, [runId]);

  if (!run) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-slate-400">
        Loading run...
      </div>
    );
  }

  const isFinished = ["passed", "failed", "error"].includes(run.status);
  const passedCount = run.steps.filter((s) => s.status === "passed").length;
  const failedCount = run.steps.filter((s) => s.status === "failed").length;
  const totalSteps = run.steps.length;
  const progressPct = Math.round(
    ((passedCount + failedCount) / totalSteps) * 100
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">
              Run{" "}
              <span className="font-mono text-slate-400">
                {run.id.slice(0, 8)}
              </span>
            </h1>
            <StatusBadge status={run.status} />
            {run.active_bugs.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                {run.active_bugs.length} bug
                {run.active_bugs.length > 1 ? "s" : ""} injected
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1 font-mono">
            {run.scenario_id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {run.status === "failed" && run.triage && (
            <button
              onClick={() => router.push(`/triage/${runId}`)}
              className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
            >
              View Triage Report
            </button>
          )}
          <button
            onClick={() => router.push("/scenarios")}
            className="px-4 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-sm hover:bg-slate-700 transition-colors"
          >
            New Run
          </button>
        </div>
      </div>

      {/* Progress bar (during execution) */}
      {!isFinished && run.status === "running" && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>
              Step {passedCount + failedCount + 1} of {totalSteps}
              {currentAction && (
                <span className="ml-2 text-blue-400">{currentAction}</span>
              )}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {/* Left: Browser view + errors */}
        <div className="space-y-4">
          {/* Browser viewer */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
            {/* Browser toolbar */}
            <div className="px-4 py-2 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[11px] text-slate-500 font-mono ml-2">
                  Nova Act Browser
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isFinished && currentAction && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-dot" />
                    Executing: {currentAction}
                  </span>
                )}
                {isFinished && (
                  <span className="text-[11px] text-slate-500">
                    Click a step to view its screenshot
                  </span>
                )}
              </div>
            </div>
            {/* Screenshot */}
            <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
              {activeScreenshot ? (
                <img
                  src={getScreenshotUrl(activeScreenshot)}
                  alt="Browser screenshot"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-600">
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
                    />
                  </svg>
                  <span className="text-sm">
                    {run.status === "pending"
                      ? "Waiting for Nova Act to start..."
                      : "No screenshot captured yet"}
                  </span>
                </div>
              )}
              {/* Step indicator overlay */}
              {activeStepIndex >= 0 && activeScreenshot && (
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm text-[11px] text-white/80">
                  Step {activeStepIndex}:{" "}
                  {run.steps.find((s) => s.step_index === activeStepIndex)
                    ?.name || ""}
                </div>
              )}
            </div>
          </div>

          {/* Console/Network errors */}
          {run.steps.some(
            (s) =>
              s.status === "failed" &&
              ((s.console_errors && s.console_errors.length > 0) ||
                (s.network_errors && s.network_errors.length > 0))
          ) && (
            <div className="rounded-xl bg-slate-800/50 border border-red-500/20 overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-700/50 bg-red-500/5">
                <span className="text-xs font-medium text-red-400">
                  Captured Errors
                </span>
              </div>
              <div className="p-4 space-y-3">
                {run.steps
                  .filter((s) => s.status === "failed")
                  .map((step) => (
                    <div key={step.id} className="space-y-2">
                      <div className="text-xs text-slate-400 font-medium">
                        Step {step.step_index}: {step.name}
                      </div>
                      {step.detail && (
                        <p className="text-sm text-red-400 bg-red-500/5 rounded px-3 py-2 border border-red-500/10">
                          {step.detail}
                        </p>
                      )}
                      {step.console_errors &&
                        step.console_errors.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">
                              Console
                            </div>
                            <pre className="text-xs text-red-300 bg-slate-900 rounded p-3 overflow-x-auto font-mono leading-relaxed">
                              {step.console_errors.join("\n")}
                            </pre>
                          </div>
                        )}
                      {step.network_errors &&
                        step.network_errors.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-1">
                              Network
                            </div>
                            {step.network_errors.map(
                              (err: any, i: number) => (
                                <div
                                  key={i}
                                  className="bg-slate-900 rounded p-3 text-xs font-mono mb-1"
                                >
                                  <span className="text-orange-400">
                                    {err.method} {err.url}
                                  </span>
                                  <span className="text-red-400 ml-2 font-bold">
                                    {err.status}
                                  </span>
                                  {err.body && (
                                    <pre className="text-slate-500 mt-1 overflow-x-auto">
                                      {JSON.stringify(err.body, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Step timeline */}
        <div
          ref={timelineRef}
          className="rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-hidden h-fit sticky top-20"
        >
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              Step Timeline
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {passedCount}/{totalSteps} passed
            </span>
          </div>
          <div className="p-2">
            {run.steps.map((step, i) => {
              const isActive =
                step.screenshot_path === activeScreenshot &&
                step.step_index === activeStepIndex;
              return (
                <button
                  key={step.id}
                  onClick={() => {
                    if (step.screenshot_path) {
                      setActiveScreenshot(step.screenshot_path);
                      setActiveStepIndex(step.step_index);
                    }
                  }}
                  className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? "bg-slate-700/60 ring-1 ring-slate-600"
                      : step.screenshot_path
                      ? "hover:bg-slate-700/30 cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  {/* Step status indicator */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        step.status === "passed"
                          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                          : step.status === "failed"
                          ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                          : step.status === "running"
                          ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30 animate-pulse-dot"
                          : step.status === "skipped"
                          ? "bg-slate-700/50 text-slate-600"
                          : "bg-slate-700/30 text-slate-600 ring-1 ring-slate-600/30"
                      }`}
                    >
                      {STATUS_ICONS[step.status] || "○"}
                    </div>
                    {i < run.steps.length - 1 && (
                      <div
                        className={`w-px h-4 mt-1 ${
                          step.status === "passed"
                            ? "bg-emerald-500/30"
                            : step.status === "failed"
                            ? "bg-red-500/30"
                            : "bg-slate-700"
                        }`}
                      />
                    )}
                  </div>
                  {/* Step info */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm leading-tight ${
                          step.status === "failed"
                            ? "text-red-400 font-medium"
                            : step.status === "passed"
                            ? "text-white"
                            : step.status === "running"
                            ? "text-blue-400 font-medium"
                            : step.status === "skipped"
                            ? "text-slate-600"
                            : "text-slate-400"
                        }`}
                      >
                        {step.name}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">
                        {step.status === "running"
                          ? "..."
                          : step.started_at && step.finished_at
                          ? `${((new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()) / 1000).toFixed(1)}s`
                          : ""}
                      </span>
                    </div>
                    {step.status === "failed" && step.detail && (
                      <p className="text-[11px] text-red-400/60 mt-0.5 leading-snug line-clamp-2">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary footer */}
          {isFinished && (
            <div className="px-4 py-3 border-t border-slate-700/50 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Result</span>
                <StatusBadge status={run.status} />
              </div>
              {run.started_at && run.finished_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Duration</span>
                  <span className="text-white font-mono text-xs">
                    {(
                      (new Date(run.finished_at).getTime() -
                        new Date(run.started_at).getTime()) /
                      1000
                    ).toFixed(1)}
                    s
                  </span>
                </div>
              )}
              {run.triage && (
                <button
                  onClick={() => router.push(`/triage/${runId}`)}
                  className="w-full mt-2 py-2.5 bg-gradient-to-r from-red-500/10 to-orange-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium hover:from-red-500/20 hover:to-orange-500/20 transition-all"
                >
                  View AI Triage Report
                </button>
              )}
              {run.status === "passed" && (
                <div className="text-center text-sm text-emerald-400 py-1">
                  All {totalSteps} steps passed
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    running: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    passed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    failed: "bg-red-500/10 text-red-400 border-red-500/30",
    error: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
        colors[status] || colors.pending
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
