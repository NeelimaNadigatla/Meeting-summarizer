import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

// "1 decision", "2 decisions"
const count = (items, word) => `${items.length} ${word}${items.length === 1 ? "" : "s"}`;

function Section({ title, icon, color, items, empty, render = (item) => item }) {
  return (
    <section className={`section section-${color}`}>
      <h2>{icon} {title}</h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{render(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MeetingDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    apiRequest(`/api/meetings/${id}`, { token })
      .then(setMeeting)
      .catch((err) => setError(err.message));
  }, [id, token]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this meeting? This can't be undone.")) return;
    try {
      await apiRequest(`/api/meetings/${id}`, { method: "DELETE", token });
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="card">
        <p className="error">{error}</p>
        <Link to="/">← Back to meetings</Link>
      </div>
    );
  }
  if (!meeting) return <p className="muted">Loading…</p>;

  const { summary } = meeting;
  return (
    <div className="card">
      <Link to="/" className="muted">← Back to meetings</Link>
      <div className="page-header">
        <h1 className="gradient-text">{meeting.title}</h1>
        <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
      </div>
      <p className="muted">{new Date(meeting.created_at).toLocaleString()}</p>

      <div className="stats">
        <span className="stat section-points">💡 {count(summary.key_points, "key point")}</span>
        <span className="stat section-decisions">✅ {count(summary.decisions, "decision")}</span>
        <span className="stat section-actions">🎯 {count(summary.action_items, "action item")}</span>
      </div>

      {/* One column on phones and tablets; a 2-column grid on laptops (see .detail-grid in styles.css). */}
      <div className="detail-grid">
        <section className="section section-summary">
          <h2>📋 Summary</h2>
          <p>{summary.summary}</p>
        </section>

        <Section title="Key points" icon="💡" color="points" items={summary.key_points} empty="No key points found." />
        <Section title="Decisions" icon="✅" color="decisions" items={summary.decisions} empty="No decisions were recorded." />
        <Section
          title="Action items"
          icon="🎯"
          color="actions"
          items={summary.action_items}
          empty="No action items."
          render={(item) => (
            <>
              {item.task}
              {(item.owner || item.due) && (
                <span className="tags">
                  {item.owner && <span className="tag">👤 {item.owner}</span>}
                  {item.due && <span className="tag">📅 {item.due}</span>}
                </span>
              )}
            </>
          )}
        />
      </div>

      <button className="btn btn-ghost" onClick={() => setShowTranscript((v) => !v)}>
        {showTranscript ? "Hide transcript" : "Show transcript"}
      </button>
      {showTranscript && <pre className="transcript">{meeting.transcript}</pre>}
    </div>
  );
}
