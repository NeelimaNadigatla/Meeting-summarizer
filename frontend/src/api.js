// Small wrapper around fetch: adds the login token and turns API errors into readable messages.
const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithRetry(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
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
  // FastAPI validation errors come back as a list.
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = first.loc?.[first.loc.length - 1];
    return field ? `${field}: ${first.msg}` : first.msg;
  }
  return `Request failed (${status})`;
}
