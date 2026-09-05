const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function getToken() {
  return localStorage.getItem("watchlist_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("watchlist_token", token);
  else localStorage.removeItem("watchlist_token");
}

export function getEmail() {
  return localStorage.getItem("watchlist_email");
}

export function setEmail(email) {
  if (email) localStorage.setItem("watchlist_email", email);
  else localStorage.removeItem("watchlist_email");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  signup: (email, password) => request("/api/auth/signup", { method: "POST", body: { email, password }, auth: false }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),

  getWatchlist: () => request("/api/watchlist"),
  addSymbol: (symbol) => request("/api/watchlist", { method: "POST", body: { symbol } }),
  removeSymbol: (symbol) => request(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" }),
  setAlerts: (symbol, alertHigh, alertLow) =>
    request(`/api/watchlist/${encodeURIComponent(symbol)}/alerts`, {
      method: "PATCH",
      body: { alertHigh, alertLow },
    }),
  acknowledge: (symbols) => request("/api/watchlist/ack", { method: "POST", body: { symbols } }),

  search: (q) => request(`/api/market/search?q=${encodeURIComponent(q)}`),
  status: () => request("/api/market/status", { auth: false }),
};

export { API_BASE, getToken };
