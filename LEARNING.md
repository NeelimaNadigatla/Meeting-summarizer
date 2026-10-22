# 📚 How This Project Works: A Learning Guide

Read this file slowly, with the code open next to it. After each section, open the file it talks about and find the lines it describes. By the end you should be able to explain every part of this project in an interview.

---

## 1. The big picture

The app has three parts that talk to each other:

```
┌──────────────┐   HTTP + JSON   ┌───────────────┐   SQL    ┌──────────────┐
│ React (UI)   │ ─────────────▶ │ FastAPI (API) │ ───────▶ │ PostgreSQL   │
│ port 5173    │ ◀───────────── │ port 8000     │ ◀─────── │ (database)   │
└──────────────┘                 └───────┬───────┘          └──────────────┘
                                         │ HTTPS
                                         ▼
                                  ┌──────────────┐
                                  │ Claude API   │
                                  │ (AI summary) │
                                  └──────────────┘
```

- **Frontend (React):** what the user sees and clicks. It never touches the database directly.
- **Backend (FastAPI):** the "brain". It checks who you are, validates data, calls the AI, and saves results.
- **Database (PostgreSQL):** stores users and meetings permanently.
- **Claude API:** an AI model that reads the transcript and writes the summary.

### What happens when you click "Summarize"

1. React sends `POST /api/meetings` with the transcript and your login token.
2. FastAPI checks the token → finds out *which user* you are.
3. Pydantic checks the transcript is between 20 and 100,000 characters.
4. `summarizer.py` sends the transcript to Claude and gets back JSON.
5. The JSON is validated against our `MeetingSummary` schema.
6. SQLAlchemy saves the meeting in PostgreSQL.
7. FastAPI returns the saved meeting as JSON → React shows it on the page.

**Interview tip:** being able to walk through this flow clearly is one of the most impressive things you can do.

---

## 2. Backend, file by file

### `requirements.txt`: the libraries

| Library | Why we use it |
|---|---|
| `fastapi` | The web framework: defines API endpoints |
| `uvicorn` | The server that actually runs the FastAPI app |
| `sqlalchemy` | ORM: lets us use Python classes instead of writing raw SQL |
| `psycopg` | The driver that connects Python to PostgreSQL |
| `pydantic` | Validates data (e.g. "email must be a valid email") |
| `pydantic-settings` | Reads settings from the `.env` file |
| `pyjwt` | Creates and checks login tokens (JWT) |
| `bcrypt` | Hashes passwords safely |
| `anthropic` | Official SDK for calling the Claude API |
| `pytest`, `httpx` | Testing |

Versions are pinned (`==`) so the project works the same on every machine.

### `config.py`: settings

Secrets (database password, JWT secret, API key) must **never** be written in the code, because code goes on GitHub. Instead they live in a `.env` file, which is listed in `.gitignore` so it never gets committed. `Settings` reads them automatically.

### `database.py`: connecting to the database

- `engine` = the connection to the database.
- `SessionLocal` = a factory that creates a "session" (a conversation with the database).
- `get_db()` is a **FastAPI dependency**: every request gets its own session, and the `finally` block guarantees it's closed even if something crashes. This prevents connection leaks.

### `models.py`: the tables

```
users                         meetings
─────────────                 ─────────────────────
id (PK)          ◀───────┐    id (PK)
email (unique)           └─── user_id (FK → users.id)
password_hash                 title
created_at                    transcript
                              summary (JSON)
                              created_at
```

- **One-to-many relationship:** one user has many meetings.
- `ondelete="CASCADE"`: if a user is deleted, their meetings are deleted too.
- `index=True` on `email`, `user_id`, and `created_at` makes lookups fast.
- `summary` is a **JSON column**: the summary has nested lists (key points, action items), so storing it as JSON is simpler than creating 3 more tables.
  *Trade-off to mention in interviews:* if we later need to query action items across meetings (e.g. "show all tasks assigned to Arjun"), we'd move them to their own table.

### `schemas.py`: the shape of data (Pydantic)

Models (`models.py`) describe the **database**. Schemas describe what goes **in and out of the API**. They are separate on purpose:
- `UserCreate` has a `password`; `UserOut` does **not**, so we can never accidentally send a password hash back to the browser.
- `Field(min_length=8)` → FastAPI automatically rejects bad input with a **422** error. We don't write any `if` checks for this.

### `auth.py`: passwords and tokens

**Password hashing (bcrypt):**
- We never store the real password. `hash_password()` turns `"mypassword"` into something like `$2b$12$Kx9...`.
- Hashing is one-way: you can't reverse it. To log in, `verify_password()` hashes what the user typed and compares.
- bcrypt adds a random **salt**, so two users with the same password get different hashes.
- bcrypt is deliberately slow, which makes brute-force attacks expensive.

**JWT (JSON Web Token):**
- After login, the server gives the browser a token like `eyJhbGciOi...`.
- The token contains `{"sub": "5", "exp": <expiry time>}` (user id 5) and is **signed** with `JWT_SECRET`.
- The browser sends it on every request: `Authorization: Bearer <token>`.
- `get_current_user()` checks the signature and expiry. If someone edits the token, the signature no longer matches → **401 Unauthorized**.
- This is **stateless**: the server doesn't need to store sessions.

### `summarizer.py`: the AI part

Two modes, chosen by `SUMMARIZER_PROVIDER` in `.env`:

**1. `claude` mode:**
- We send a **system prompt** (instructions: who the summary is for, what each field means, "don't invent things") and the transcript.
- The transcript is wrapped in `<transcript>` tags so the AI clearly knows where it starts and ends.
- **Structured outputs:** we pass a **JSON Schema** (`SUMMARY_SCHEMA`). This forces the AI to reply with JSON in exactly our shape, so we never have to parse messy text.
- We validate the reply again with Pydantic (`MeetingSummary.model_validate_json`) as a second safety check.
- **Error handling:** wrong API key, rate limits, network errors and refusals are each caught and turned into a friendly message. The API returns **502 Bad Gateway** ("a service we depend on failed") instead of crashing.
- **Fallbacks:** if the main model declines a request, the API automatically retries on a fallback model.

**2. `mock` mode:** simple rules with regular expressions. Lines with "agreed/decided" become decisions, lines with "will/needs to" become action items, and `"Name: text"` gives us the owner. It works offline and costs nothing, which makes it great for development and tests.

**Design idea to mention:** the rest of the app only calls `summarize(transcript)`. It doesn't care which mode is used. Swapping AI providers means changing **one file**.

### `routers/auth.py`: register and log in

- `register`: lowercases the email (so `A@x.com` and `a@x.com` are the same), checks for duplicates (**409 Conflict**), hashes the password, saves, returns a token.
- `login`: returns the **same error** for "no such email" and "wrong password". If we said "email not found", attackers could discover which emails are registered.

### `routers/meetings.py`: the main features

- Every endpoint has `user = Depends(get_current_user)`, so you must be logged in.
- **Authorization:** `_get_own_meeting()` checks `meeting.user_id == user.id`. If you try to open someone else's meeting, you get **404**, not 403, so we don't even reveal it exists.
- **Search:** `ilike` = case-insensitive SQL `LIKE`. `%payment%` matches any title or transcript containing "payment".
- Newest meetings first: `order_by(created_at.desc())`.

### `main.py`: putting it together

- `lifespan`: creates the tables when the server starts.
- **CORS:** browsers block a page on port 5173 from calling port 8000 unless the server allows it. `CORSMiddleware` gives that permission.
- `include_router`: plugs in the auth and meeting endpoints.
- FastAPI automatically creates interactive docs at **http://localhost:8000/docs**. Open this and try the API by hand!

---

## 3. Tests (`backend/tests/`)

Tests are code that checks your code. Run them with `pytest`.

- `conftest.py` switches to a **separate SQLite test database** and **mock** summarizer, so tests are fast, free, and never touch your real data.
- The `client` fixture gives every test a **fresh, empty database**, so tests don't affect each other.
- What we test (11 tests):
  - register, duplicate email, short password, login, wrong password
  - routes need a valid token
  - creating a summary returns decisions and action items with owners
  - list order, search, and get-one
  - **users can't see or delete each other's meetings** (security!)
  - delete works

**Interview tip:** "I wrote tests including a test that one user can't access another user's data" is a strong sentence.

---

## 4. Frontend (React)

### `vite.config.js`
**Vite** is the dev server and build tool. The `proxy` forwards `/api/...` to `localhost:8000`, so the frontend can call `/api/meetings` without writing the full URL.

### `api.js`: one place for all API calls
- Adds the `Authorization` header automatically.
- Turns FastAPI's error format into a readable message (`"password: String should have at least 8 characters"`).
- Every page uses this one function, with no repeated `fetch` code.

### `auth.jsx`: login state with React Context
- **Context** lets any component read login state without passing props through every level.
- The token is saved in `localStorage` so you stay logged in after a refresh.
- On load, it calls `/api/auth/me` to get the user. It logs you out **only on 401** (invalid token), not on a network error. (We found and fixed this bug while testing: restarting the server used to log everyone out!)

### `App.jsx`: routing
- **React Router** maps URLs to pages: `/login`, `/register`, `/`, `/meetings/new`, `/meetings/:id`.
- `RequireAuth` is a wrapper: if you're not logged in, it redirects to `/login`.

### Pages
- **AuthPage:** one component for both login and register (the `mode` prop decides). Shows server errors under the form.
- **Dashboard:** lists meetings. The search box uses **debouncing**: it waits 300ms after you stop typing before calling the API, so we don't send a request on every keypress.
- **NewMeeting:** textarea + **FileReader** to read a `.txt` file in the browser + a "Use sample" button for demos.
- **MeetingDetail:** shows the summary sections, owner/due tags, a show/hide transcript toggle, and delete with a confirm dialog.

### React concepts used
| Concept | Where |
|---|---|
| `useState` | form fields, loading, errors |
| `useEffect` | loading data when a page opens |
| `useContext` | reading login state (`useAuth`) |
| `useParams` | reading `:id` from the URL |
| `useNavigate` | redirecting after login or create |
| Conditional rendering | loading / error / empty states |
| Lists with `key` | meeting list |

---

## 4b. Chrome extension (`extension/`)

The extension is just **another client** for the same API, like the React app. The backend didn't change at all. That's the benefit of a clean REST API.

| File | What it does |
|---|---|
| `manifest.json` | The extension's "ID card": name, permissions, which files to run. Uses **Manifest V3** (the current Chrome standard). |
| `config.js` | The API and web app URLs. |
| `api.js` | Login and summarize calls. Stores the token in `chrome.storage.local` (the extension's version of localStorage). |
| `background.js` | The **service worker**: runs in the background, creates the right-click menu, and does the summarizing. |
| `popup.html/js/css` | The small window when you click the extension icon. |

**Permissions, and why each one is needed** (Chrome shows these to users, so ask only for what you need):
- `storage`: save the login token
- `contextMenus`: add "Summarize meeting text" to the right-click menu
- `activeTab` + `scripting`: read the selected text from the current page, only when you right-click
- `host_permissions: localhost:8000`: allowed to call our API (this also means CORS doesn't block it)

**Key ideas to explain in interviews:**
- **Why summarize in the background, not the popup?** The popup closes as soon as you click away, and anything running in it stops. The service worker keeps running, so the summary still gets saved. The popup sends a **message** (`chrome.runtime.sendMessage`) and the background replies.
- **Why read the selection with `executeScript`?** Chrome's built-in `selectionText` can lose line breaks, and line breaks matter for "Speaker: text" transcripts. There's a fallback for pages that block scripts.
- **Security: `textContent`, never `innerHTML`.** Summaries contain text from random web pages. Using `innerHTML` could let that text inject HTML or scripts into the popup (an XSS attack). `textContent` always treats it as plain text.
- **Feedback without a UI:** the icon badge shows `…` while working and `!` on error. The popup shows the error the next time you open it.

### Live Google Meet capture (`meet-captions.js`)

This is a **content script**: code that Chrome injects *into a web page* (here, only `meet.google.com`, set in `manifest.json` under `content_scripts`). It can read the page's HTML, which is how it sees the captions.

How it works, step by step:
1. You turn on captions in Meet, so the spoken words appear on the page as text.
2. You click **Start capture** in the popup. The popup sends a message to the content script (`chrome.tabs.sendMessage`).
3. The content script starts a **MutationObserver**, a browser feature that calls our code whenever the page changes. Captions change many times per second, so we wait 250ms between scans (this is called **throttling**).
4. Each scan finds every caption block and reads the **speaker name** and **text**.
5. Each block on the page is linked to one transcript entry using a **WeakMap**, so when Meet adds words to a caption, we update the same entry instead of creating a duplicate.
6. Meet **drops the first words** of very long captions and **removes old captions** from the page. `mergeText` rebuilds the full sentence, and our `entries` list keeps lines even after they leave the page.
7. While the popup is open, it asks for the status every second and shows the latest lines, which is the "live" view.
8. **Summarize** builds `Speaker: text` lines, the same format as a normal transcript, and sends them to the same API.

**Why the `SELECTORS` list?** Google doesn't offer an official API for Meet captions, so we read them from Meet's HTML, which Google can change at any time. All the "where are the captions" knowledge is in one list at the top of the file. There's also a **fallback** that finds caption blocks by their shape ("name on line 1, words after it") if the class names change. `dev/fake-meet.html` tests both cases.

**Interview line:** *"I used a content script with a MutationObserver to capture Google Meet's live captions, de-duplicated incremental caption updates with a WeakMap, and isolated the fragile DOM selectors with a fallback strategy."*

---

## 5. HTTP status codes used

| Code | Meaning | When |
|---|---|---|
| 200 | OK | successful GET / login |
| 201 | Created | register, new meeting |
| 204 | No Content | delete |
| 401 | Unauthorized | missing, bad, or expired token; wrong password |
| 404 | Not Found | meeting doesn't exist or isn't yours |
| 409 | Conflict | email already registered |
| 422 | Unprocessable | validation failed (Pydantic) |
| 502 | Bad Gateway | the AI service failed |

---

## 6. Interview questions you should now be able to answer

1. **Walk me through what happens when a user creates a summary.** (Section 1)
2. **How do you store passwords?** bcrypt hash with salt, never plain text.
3. **What is a JWT and how does your auth work?** A signed token with user id + expiry, sent as a Bearer header, checked on every request.
4. **How do you stop users from seeing each other's data?** Every query filters by `user_id`, plus a test that proves it.
5. **Why FastAPI?** Fast, automatic validation with Pydantic, automatic API docs, type hints.
6. **What's an ORM? Why SQLAlchemy?** Python classes map to tables, so there's less raw SQL and less risk of SQL injection.
7. **Why store the summary as JSON?** Nested data, always read together; the trade-off is harder querying.
8. **How do you make sure the AI returns valid data?** Structured outputs with a JSON schema, plus Pydantic validation, plus error handling.
9. **What if the AI API is down?** It's caught, the API returns a 502 with a friendly message, and nothing is saved.
10. **What is CORS?** The browser's security rule about cross-origin requests; the server must allow the frontend's origin.
11. **How would you scale this?** Background jobs for long transcripts, pagination, Alembic migrations, caching, rate limiting.

---

## 7. Practice: make it yours 💪

Interviewers can tell when you've actually worked on code. Try these yourself, in order:

1. ⭐ Add a **"Copy summary"** button on the meeting page (hint: `navigator.clipboard.writeText`).
2. ⭐ Show the **number of action items** next to each meeting on the dashboard.
3. ⭐⭐ Add **pagination** to `GET /api/meetings` (`limit` and `offset` query params) and write a test for it.
4. ⭐⭐ Let users **edit the title** of a meeting (`PATCH /api/meetings/{id}`), with a test.
5. ⭐⭐⭐ Add **Alembic** for database migrations instead of `create_all`.
6. ⭐⭐⭐ **Deploy it** (backend on Render, database on Neon, frontend on Vercel) and put the live link on your resume.
