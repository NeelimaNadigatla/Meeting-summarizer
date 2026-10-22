import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

const MAX_CHARS = 100000;

const SAMPLE = `Priya: Let's review the launch plan for the new mobile app this week.
Arjun: The login screen and the payment flow are both finished and tested.
Priya: Great. We agreed to launch the beta on the 15th.
Arjun: I will send the release notes to the marketing team by Friday.
Kavya: The analytics dashboard still has a few bugs. I will fix them before the launch.`;

export default function NewMeeting() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Please upload a .txt file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTranscript(String(reader.result));
      if (!title) setTitle(file.name.replace(/\.txt$/i, ""));
      setError("");
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const meeting = await apiRequest("/api/meetings", {
        method: "POST",
        token,
        body: { title: title.trim() || null, transcript },
      });
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="new-layout">
      <div className="card">
        <h1 className="gradient-text">New meeting summary</h1>
        <p className="muted">Paste a transcript or upload a .txt file. The AI will pull out the key points, decisions and action items.</p>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Title <span className="muted">(optional, we'll generate one)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>

          <label>
            Transcript
            <textarea
              rows={14}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Speaker: what they said…"
              minLength={20}
              maxLength={MAX_CHARS}
              required
            />
          </label>

          <div className="row">
            <label className="btn btn-ghost file-btn">
              Upload .txt
              <input type="file" accept=".txt,text/plain" onChange={handleFile} hidden />
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => setTranscript(SAMPLE)}>
              Use sample
            </button>
            <span className="muted counter">{transcript.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
          </div>

          {error && <p className="error">{error}</p>}
          <button className="btn" disabled={submitting}>
            {submitting ? "Summarizing… this can take a few seconds" : "Summarize"}
          </button>
        </form>
      </div>

      {/* Side panel: only shown on laptop-size screens (see .new-aside in styles.css). */}
      <aside className="card new-aside">
        <h2>🪄 How it works</h2>
        <ol className="steps">
          <li><strong>Paste or upload</strong> your meeting transcript.</li>
          <li><strong>Click Summarize.</strong> The AI reads the whole conversation.</li>
          <li><strong>Get the highlights:</strong> summary, key points, decisions and action items.</li>
        </ol>
        <div className="aside-tip">
          💡 <strong>Tip:</strong> transcripts in the format <code>Name: what they said</code> give the
          best results, because the AI can tell who owns each action item.
        </div>
      </aside>
    </div>
  );
}
