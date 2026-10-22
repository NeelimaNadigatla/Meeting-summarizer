// Talks to the FastAPI backend. Shared by the popup and the background service worker.
import { API_URL } from "./config.js";

// ---------- Token storage (chrome.storage is the extension's version of localStorage) ----------

export async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token ?? null;
}

export async function setToken(token) {
  await chrome.storage.local.set({ token });
}

export async function clearToken() {
  await chrome.storage.local.remove("token");
}

// ---------- Requests ----------

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithRetry(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) await clearToken();
    const error = new Error(errorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

// A free hosted server sleeps when unused and takes up to a minute to wake up.
// Retry network failures (no response at all) a few times: after 2, 4, 8 and 16 seconds.
async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, options);
    } catch {
      if (attempt === 4) {
        throw new Error("Can't reach the server. It may be waking up; please try again in a minute.");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
    }
  }
}

function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = first.loc?.[first.loc.length - 1];
    if (field === "transcript" && first.type === "string_too_short") {
      return "That text is too short to summarize. Select at least a few sentences.";
    }
    return field ? `${field}: ${first.msg}` : first.msg;
  }
  return `Request failed (${status})`;
}

// ---------- Actions ----------

export async function login(email, password) {
  const data = await apiRequest("/api/auth/login", { method: "POST", body: { email, password } });
  await setToken(data.access_token);
}

export async function getMe() {
  const token = await getToken();
  if (!token) return null;
  return apiRequest("/api/auth/me", { token });
}

export async function summarize(transcript, title) {
  const token = await getToken();
  if (!token) throw new Error("Please log in from the extension popup first.");
  return apiRequest("/api/meetings", {
    method: "POST",
    token,
    body: { transcript, title: title || null },
  });
}
