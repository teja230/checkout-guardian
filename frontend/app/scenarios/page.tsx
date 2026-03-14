"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getScenarios, startRun } from "@/lib/api";

interface Scenario {
  id: string;
  name: string;
  description: string;
  seeded_bugs: { id: string; name: string; description: string }[];
}

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeBugs, setActiveBugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getScenarios()
      .then((data) => {
        setScenarios(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selectedScenario = scenarios.find((s) => s.id === selected);

  const toggleBug = (bugId: string) => {
    setActiveBugs((prev) => {
      const next = new Set(prev);
      if (next.has(bugId)) next.delete(bugId);
      else next.add(bugId);
      return next;
    });
  };

  const handleRun = async () => {
    if (!selected) return;
    setStarting(true);
    try {
      const run = await startRun(selected, Array.from(activeBugs));
      router.push(`/runs/${run.id}`);
    } catch (err) {
      console.error("Failed to start run:", err);
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-slate-400">
        Loading scenarios...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-white mb-2">Scenario Runner</h1>
      <p className="text-slate-400 mb-8">
        Select a checkout scenario, toggle seeded bugs, and run.
      </p>

      {/* Scenario selector */}
      <div className="grid gap-3 mb-8">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => {
              setSelected(scenario.id);
              setActiveBugs(new Set());
            }}
            className={`text-left p-4 rounded-lg border transition-all ${
              selected === scenario.id
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-white">{scenario.name}</div>
                <div className="text-sm text-slate-400 mt-1">
                  {scenario.description}
                </div>
              </div>
              {scenario.seeded_bugs.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 whitespace-nowrap ml-4">
                  {scenario.seeded_bugs.length} bug{scenario.seeded_bugs.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Bug toggles */}
      {selectedScenario && selectedScenario.seeded_bugs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            Seeded Bugs
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Enable bugs to inject into this run. Disabled = happy path.
          </p>
          <div className="space-y-3">
            {selectedScenario.seeded_bugs.map((bug) => (
              <label
                key={bug.id}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  activeBugs.has(bug.id)
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-slate-700 bg-slate-800/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={activeBugs.has(bug.id)}
                  onChange={() => toggleBug(bug.id)}
                  className="mt-1 accent-red-500"
                />
                <div>
                  <div className="font-medium text-white text-sm">
                    {bug.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {bug.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Run button */}
      {selected && (
        <button
          onClick={handleRun}
          disabled={starting}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-lg font-medium hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {starting ? "Starting run..." : "Run Scenario"}
        </button>
      )}

      {!selected && scenarios.length > 0 && (
        <div className="text-center text-slate-500 py-8">
          Select a scenario above to get started
        </div>
      )}

      {scenarios.length === 0 && (
        <div className="text-center text-slate-500 py-8">
          No scenarios found. Make sure the API is running and seeded.
        </div>
      )}
    </div>
  );
}
