# 📝 Meeting Summarizer

A full-stack web app that turns meeting transcripts into structured summaries: a short overview, key points, decisions, and action items with owners and due dates.

**Tech stack:** React.js · FastAPI · PostgreSQL · SQLAlchemy · Pydantic · JWT auth · Claude API · pytest

## Features

- Sign up / log in with JWT authentication (passwords hashed with bcrypt)
- Paste a transcript or upload a `.txt` file
- AI-generated summary, key points, decisions, and action items
- Meeting history with search across titles and transcripts
- Each user only sees their own meetings
- Works offline with a rule-based "mock" summarizer when no API key is set
- Chrome extension: summarize selected text on any page from the right-click menu, or paste into the popup

## Project structure

```
meeting-summarizer/
├── backend/                 FastAPI app
│   ├── app/
│   │   ├── main.py          App setup, CORS, routers
│   │   ├── config.py        Settings from .env
│   │   ├── database.py      SQLAlchemy engine + session
│   │   ├── models.py        Database tables (User, Meeting)
│   │   ├── schemas.py       Request/response shapes (Pydantic)
│   │   ├── auth.py          Password hashing + JWT tokens
│   │   ├── summarizer.py    Claude API + offline summarizer
│   │   └── routers/         API endpoints (auth, meetings)
│   └── tests/               pytest tests
└── frontend/                React app (Vite)
    └── src/
        ├── api.js           fetch wrapper
        ├── auth.jsx         login state (React Context)
        └── pages/           Login, Dashboard, New meeting, Meeting detail
```

## Run it locally

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

Edit `backend/.env`:

- **Database:** create a PostgreSQL database called `meeting_summarizer` and set `DATABASE_URL`
  with your Postgres password. (If you leave `DATABASE_URL` out, the app uses a local SQLite file.)
- **AI:** set `SUMMARIZER_PROVIDER=claude` and `ANTHROPIC_API_KEY=...` to use real AI summaries.
  Keep `SUMMARIZER_PROVIDER=mock` to run without a key.

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Local demo account used during development: `demo@example.com` / `demo-password-1`
(or just sign up with your own).

### 3. Chrome extension (optional)

1. Make sure the backend is running on port 8000.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.
4. Pin the extension, click its icon, and log in.
5. Paste a transcript in the popup, **or** select transcript text on any web page →
   right-click → **Summarize meeting text**. The summary opens in the web app.
6. **Live Google Meet capture:** in a Meet call, turn on captions (**CC**), open the extension,
   and click **Start capture**. Captions appear live in the popup. Click **Summarize** when done.
   (If the Meet tab was open before you loaded the extension, refresh it once.)

Google Meet has no official captions API, so capture reads the captions from the page. If Meet
changes its page and capture stops working, update `SELECTORS` at the top of
`extension/meet-captions.js`. `extension/dev/fake-meet.html` is a local test page for this.

After deploying, update `extension/config.js` and `host_permissions` in `extension/manifest.json`
to your live URLs.

### 4. Tests

```bash
cd backend
pytest
```

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Log in, returns JWT |
| GET | `/api/auth/me` | Current user |
| POST | `/api/meetings` | Summarize a transcript and save it |
| GET | `/api/meetings?q=` | List your meetings (optional search) |
| GET | `/api/meetings/{id}` | One meeting with its summary |
| DELETE | `/api/meetings/{id}` | Delete a meeting |
