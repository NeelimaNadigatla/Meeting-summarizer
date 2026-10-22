import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Dashboard() {
  const { token } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reload the list when the search text changes, waiting 300ms after the user stops typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      apiRequest(`/api/meetings${query}`, { token })
        .then((data) => {
          setMeetings(data);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, token]);

  return (
    <>
      <div className="page-header">
        <h1 className="gradient-text">Your meetings</h1>
        <Link to="/meetings/new" className="btn">+ New summary</Link>
      </div>

      <input
        className="search"
        type="search"
        placeholder="Search by title or words in the transcript…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : meetings.length === 0 ? (
        <div className="card empty">
          {search ? (
            <>
              <div className="empty-emoji">🔍</div>
              <p>No meetings match “{search}”.</p>
            </>
          ) : (
            <>
              <div className="empty-emoji">🗒️</div>
              <p>No meetings yet.</p>
              <Link to="/meetings/new" className="btn">Summarize your first meeting</Link>
            </>
          )}
        </div>
      ) : (
        <ul className="meeting-list">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              {/* Each meeting gets one of 5 accent colors, based on its id. */}
              <Link to={`/meetings/${meeting.id}`} className={`card meeting-item accent-${meeting.id % 5}`}>
                <span className="meeting-icon">{meeting.title.trim().charAt(0).toUpperCase() || "M"}</span>
                <span className="meeting-text">
                  <strong>{meeting.title}</strong>
                  <span className="muted">{new Date(meeting.created_at).toLocaleString()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
