"use client";

import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-violet-600/5 to-transparent" />
        <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 text-center relative">
          <div className="inline-block mb-6 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Powered by Amazon Nova Act + Nova 2 Lite
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Your AI QA
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              Investigator
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Checkout Guardian runs your e-commerce checkout flows in a real browser,
            detects failures, captures evidence, and generates developer-ready triage
            reports with root cause analysis.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push("/scenarios")}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-lg font-medium hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-blue-500/25"
            >
              Run Demo Scenario
            </button>
            <button
              onClick={() => router.push("/runs")}
              className="px-6 py-3 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 transition-all border border-slate-700"
            >
              View Past Runs
            </button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-white text-center mb-12">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <StepCard
            number="1"
            title="Select a Scenario"
            description="Choose a checkout flow and optionally enable seeded bugs to simulate real-world failures."
            color="blue"
          />
          <StepCard
            number="2"
            title="Watch It Run"
            description="Nova Act drives a real browser through the checkout steps. See live screenshots and step status."
            color="violet"
          />
          <StepCard
            number="3"
            title="Get the Diagnosis"
            description="When a failure occurs, Nova 2 Lite analyzes all evidence and produces a Jira-ready bug report."
            color="emerald"
          />
        </div>
      </section>

      {/* Bug catalog teaser */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-white text-center mb-4">
          Seeded Bug Catalog
        </h2>
        <p className="text-slate-400 text-center mb-10 max-w-xl mx-auto">
          Toggle real-world checkout bugs to see how Guardian detects and triages them.
        </p>
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {[
            {
              name: "Promo code state mismatch",
              type: "promotion_state_bug",
              severity: "High",
            },
            {
              name: "ZIP leading-zero rejection",
              type: "address_validation_bug",
              severity: "Critical",
            },
            {
              name: "Pickup still charges shipping",
              type: "pricing_mismatch",
              severity: "High",
            },
            {
              name: "Stale inventory cache",
              type: "inventory_reservation_failure",
              severity: "High",
            },
            {
              name: "Payment gateway 504",
              type: "payment_gateway_timeout",
              severity: "Critical",
            },
          ].map((bug) => (
            <div
              key={bug.type}
              className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50"
            >
              <div>
                <div className="text-sm font-medium text-white">{bug.name}</div>
                <div className="text-xs text-slate-500 font-mono">{bug.type}</div>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  bug.severity === "Critical"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-yellow-500/10 text-yellow-400"
                }`}
              >
                {bug.severity}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        Built for the Amazon Nova AI Hackathon
      </footer>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  color,
}: {
  number: string;
  title: string;
  description: string;
  color: string;
}) {
  const gradients: Record<string, string> = {
    blue: "from-blue-500 to-blue-600",
    violet: "from-violet-500 to-violet-600",
    emerald: "from-emerald-500 to-emerald-600",
  };
  return (
    <div className="p-6 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-slate-600/50 transition-colors">
      <div
        className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white font-bold text-lg mb-4`}
      >
        {number}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
