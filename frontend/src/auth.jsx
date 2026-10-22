import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "./api.js";

const TOKEN_KEY = "ms_token";
const AuthContext = createContext(null);

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session just won't persist.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  // When we have a token, load the current user. Log out only if the server says the
  // token is invalid (401); a network blip or server restart shouldn't sign the user out.
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiRequest("/api/auth/me", { token })
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) logout();
      })
      .finally(() => setLoading(false));
  }, [token, logout]);

  const authenticate = async (mode, email, password) => {
    const data = await apiRequest(`/api/auth/${mode}`, {
      method: "POST",
      body: { email, password },
    });
    writeToken(data.access_token);
    setToken(data.access_token);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
