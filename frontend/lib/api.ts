const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getScenarios() {
  return fetchApi("/api/scenarios");
}

export async function getScenario(id: string) {
  return fetchApi(`/api/scenarios/${id}`);
}

export async function startRun(scenarioId: string, activeBugs: string[]) {
  return fetchApi("/api/runs", {
    method: "POST",
    body: JSON.stringify({ scenarioId, activeBugs }),
  });
}

export async function getRun(id: string) {
  return fetchApi(`/api/runs/${id}`);
}

export async function getRuns() {
  return fetchApi("/api/runs");
}

export function getRunStreamUrl(id: string) {
  return `${API_BASE}/api/runs/${id}/stream`;
}

export function getScreenshotUrl(filename: string) {
  return `${API_BASE}/api/artifacts/screenshots/${filename}`;
}
