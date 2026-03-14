"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getRun, getScreenshotUrl } from "@/lib/api";

interface TriageReport {
  failure_category: string;
  root_cause: string;
  confidence: number;
  repro_steps: string[];
  suggested_fix: string;
  jira_title: string;
  jira_description: string;
  severity: string;
}

export default function TriagePage() {
  const params = useParams();
  const runId = params.id as string;
  const [triage, setTriage] = useState<TriageReport | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRun(runId)
      .then((data) => {
        setTriage(data.triage);
        setSteps(data.steps || []);
        setScenarioId(data.scenario_id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [runId]);

  const copyJiraPayload = () => {
    if (!triage) return;
    const payload = {
      summary: triage.jira_title,
      description: triage.jira_description,
      priority: triage.severity === "critical" ? "Highest" : "High",
      labels: ["checkout-guardian", triage.failure_category],
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-400">
        Loading triage report...
      </div>
    );
  }

  if (!triage) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-400">
        No triage report available for this run.
      </div>
    );
  }

  const failedSteps = steps.filter((s: any) => s.status === "failed");

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">
              Failure Analysis
            </h1>
            <SeverityBadge severity={triage.severity} />
          </div>
          <p className="text-sm text-slate-400">
            Run{" "}
            <span className="font-mono text-slate-300">
              {runId.slice(0, 8)}
            </span>{" "}
            &middot; {scenarioId}
          </p>
        </div>
        <button
          onClick={copyJiraPayload}
          className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors flex items-center gap-2"
        >
          {copied ? (
            <>
              <CheckIcon /> Copied!
            </>
          ) : (
            <>
              <ClipboardIcon /> Copy Jira Payload
            </>
          )}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_350px] gap-6">
        {/* Main analysis */}
        <div className="space-y-6">
          {/* Root cause */}
          <section className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Root Cause</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Confidence:</span>
                <ConfidenceBar value={triage.confidence} />
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {triage.root_cause}
            </p>
            <div className="mt-3 inline-block px-2 py-1 rounded bg-slate-700/50 text-xs font-mono text-slate-400">
              {triage.failure_category}
            </div>
          </section>

          {/* Repro steps */}
          <section className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Repro Steps
            </h2>
            <ol className="space-y-2">
              {triage.repro_steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-mono">
                    {i + 1}
                  </span>
                  <span className="text-slate-300 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Suggested fix */}
          <section className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Suggested Fix
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {triage.suggested_fix}
            </p>
          </section>

          {/* Jira preview */}
          <section className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Jira Bug Report
            </h2>
            <div className="bg-slate-900 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-xs text-slate-500 block mb-1">
                  Title
                </span>
                <span className="text-sm text-white font-medium">
                  {triage.jira_title}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block mb-1">
                  Description
                </span>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {triage.jira_description}
                </pre>
              </div>
            </div>
          </section>
        </div>

        {/* Right sidebar: Screenshots + errors */}
        <div className="space-y-4">
          {/* Screenshots */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
            <h3 className="text-sm font-medium text-white mb-3">
              Evidence Screenshots
            </h3>
            <div className="space-y-3">
              {steps
                .filter((s: any) => s.screenshot_path)
                .map((step: any) => (
                  <div key={step.id}>
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          step.status === "failed"
                            ? "bg-red-500"
                            : step.status === "passed"
                            ? "bg-emerald-500"
                            : "bg-slate-600"
                        }`}
                      />
                      Step {step.step_index}: {step.name}
                    </div>
                    <img
                      src={getScreenshotUrl(step.screenshot_path)}
                      alt={`Step ${step.step_index}`}
                      className={`w-full rounded border ${
                        step.status === "failed"
                          ? "border-red-500/50"
                          : "border-slate-700"
                      }`}
                    />
                  </div>
                ))}
            </div>
          </div>

          {/* Console errors */}
          {failedSteps.some((s: any) => s.console_errors?.length > 0) && (
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                Console Errors
              </h3>
              {failedSteps.map((step: any) =>
                step.console_errors?.map((err: string, i: number) => (
                  <pre
                    key={`${step.id}-${i}`}
                    className="text-xs text-red-300 bg-slate-900 rounded p-2 mb-2 overflow-x-auto"
                  >
                    {err}
                  </pre>
                ))
              )}
            </div>
          )}

          {/* Network errors */}
          {failedSteps.some((s: any) => s.network_errors?.length > 0) && (
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                Network Errors
              </h3>
              {failedSteps.map((step: any) =>
                step.network_errors?.map((err: any, i: number) => (
                  <div
                    key={`${step.id}-${i}`}
                    className="bg-slate-900 rounded p-2 mb-2 text-xs"
                  >
                    <span className="text-orange-400">
                      {err.method} {err.url}
                    </span>
                    <span className="text-red-400 ml-2">
                      {err.status}
                    </span>
                    {err.body && (
                      <pre className="text-slate-400 mt-1 overflow-x-auto">
                        {JSON.stringify(err.body, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    low: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase ${
        colors[severity] || colors.medium
      }`}
    >
      {severity}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-300 font-mono">{pct}%</span>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}
