import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewMeeting from "./pages/NewMeeting.jsx";
import MeetingDetail from "./pages/MeetingDetail.jsx";

function RequireAuth({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <p className="muted center">Loading…</p>;
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">📝 Meeting Summarizer</Link>
          {user && (
            <div className="topbar-right">
              <span className="user">{user.email}</span>
              <button className="btn btn-ghost" onClick={logout}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/meetings/new" element={<RequireAuth><NewMeeting /></RequireAuth>} />
          <Route path="/meetings/:id" element={<RequireAuth><MeetingDetail /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
