import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { token, authenticate } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (token) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await authenticate(mode, email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      {/* Welcome panel: only shown on laptop-size screens (see .auth-hero in styles.css). */}
      <aside className="auth-hero">
        <h2>Never lose track of a meeting again.</h2>
        <p>Paste a transcript and get the important parts in seconds.</p>
        <ul>
          <li>📋 Short, clear summaries</li>
          <li>✅ Every decision in one place</li>
          <li>🎯 Action items with owners and deadlines</li>
          <li>🔍 Search all your past meetings</li>
        </ul>
      </aside>

      <div className="card auth-card">
        <div className="auth-emoji">{isLogin ? "👋" : "✨"}</div>
        <h1 className="gradient-text">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">
          {isLogin ? "Log in to see your meeting summaries." : "Start turning meetings into action items."}
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {!isLogin && <small className="muted">At least 8 characters.</small>}
          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={submitting}>
            {submitting ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="muted">
          {isLogin ? "New here? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link>
        </p>
      </div>
    </div>
  );
}
