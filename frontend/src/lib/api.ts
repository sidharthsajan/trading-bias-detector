/**
 * API client for Trading Bias Detector backend.
 * All requests go to /api (proxied to backend in dev).
 */

const getToken = (): string | null => localStorage.getItem("access_token");

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || String(err));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function signUp(email: string, password: string, displayName?: string) {
  const data = await api<{ access_token: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  return { data, error: null };
}

export async function signIn(email: string, password: string) {
  const data = await api<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { data, error: null };
}

export async function getMe() {
  return api<{ id: string; email: string; display_name: string | null }>("/auth/me");
}

// Profiles
export async function getProfile() {
  return api<{ display_name: string | null }>("/profiles/me");
}

export async function updateProfile(display_name: string) {
  return api("/profiles/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name }),
  });
}

// Trades
export async function getTrades(limit = 100, order: "asc" | "desc" = "desc") {
  return api<any[]>(`/trades?limit=${limit}&order=${order}`);
}

export async function createTrades(rows: Record<string, unknown>[]) {
  return api<{ created: number }>("/trades/bulk", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

// Bias analyses
export async function getBiasAnalyses() {
  return api<any[]>("/bias-analyses");
}

export async function deleteBiasAnalyses() {
  return api("/bias-analyses", { method: "DELETE" });
}

export async function createBiasAnalyses(rows: Record<string, unknown>[]) {
  return api("/bias-analyses/bulk", {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

// Risk profiles
export async function getRiskProfiles(limit = 10) {
  return api<any[]>(`/risk-profiles?limit=${limit}`);
}

export async function createRiskProfile(row: Record<string, unknown>) {
  return api("/risk-profiles", {
    method: "POST",
    body: JSON.stringify(row),
  });
}

// Emotional tags
export async function getEmotionalTags(limit = 100) {
  return api<any[]>(`/emotional-tags?limit=${limit}`);
}

export async function createEmotionalTag(row: Record<string, unknown>) {
  return api("/emotional-tags", {
    method: "POST",
    body: JSON.stringify(row),
  });
}

// Chat messages
export async function getChatMessages() {
  return api<any[]>("/chat-messages");
}

export async function createChatMessage(role: string, content: string) {
  return api("/chat-messages", {
    method: "POST",
    body: JSON.stringify({ role, content }),
  });
}

export async function deleteChatMessages() {
  return api("/chat-messages", { method: "DELETE" });
}

// AI Coach
export async function aiCoach(body: { message: string; trades: any[]; biases: any[]; history: any[] }) {
  return api<{ reply: string }>("/ai-coach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
