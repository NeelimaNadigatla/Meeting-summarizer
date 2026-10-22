import { clearToken, getMe, login } from "./api.js";
import { APP_URL } from "./config.js";

const $ = (id) => document.getElementById(id);

// Google Meet state: null = not a Meet tab, "ready" = capture script is running in the tab,
// "reload" = a Meet tab that was opened before the extension was installed/updated.
let meetMode = null;
let meetTabId = null;
let pollTimer = null;

function show(view) {
  for (const id of ["login-view", "main-view", "result"]) $(id).hidden = id !== view;
  $("logout").hidden = view === "login-view";
  $("meet-panel").hidden = !(view === "main-view" && meetMode);
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

async function init() {
  $("signup").href = `${APP_URL}/register`;

  // Show any error from a right-click summary that failed while the popup was closed.
  const { lastError } = await chrome.storage.local.get("lastError");
  if (lastError) {
    showError(lastError);
    await chrome.storage.local.remove("lastError");
    await chrome.action.setBadgeText({ text: "" });
  }

  try {
    const user = await getMe();
    if (user) {
      $("user-email").textContent = user.email;
      await detectMeet();
      show("main-view");
      return;
    }
  } catch (err) {
    if (err.status !== 401) showError(err.message);
  }
  show("login-view");
}

$("login-view").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  try {
    await login($("email").value, $("password").value);
    await init();
  } catch (err) {
    showError(err.message);
  }
});

$("logout").addEventListener("click", async () => {
  await clearToken();
  showError("");
  show("login-view");
});

$("main-view").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("summarize");
  await summarizeText($("transcript").value, $("title").value.trim(), button);
});

$("new").addEventListener("click", () => {
  $("transcript").value = "";
  $("title").value = "";
  show("main-view");
});

// Sends text to the background worker, which calls the API (see background.js).
async function summarizeText(transcript, title, button) {
  showError("");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "⏳ Summarizing…";

  const response = await chrome.runtime.sendMessage({ type: "summarize", transcript, title });

  button.disabled = false;
  button.textContent = label;
  if (response.ok) {
    renderResult(response.meeting);
  } else {
    showError(response.error);
    if (response.error.includes("log in")) show("login-view");
  }
}

// Build the result with textContent (never innerHTML) so text from the page can't inject HTML.
function renderResult(meeting) {
  $("result-title").textContent = meeting.title;
  $("result-summary").textContent = meeting.summary.summary;
  fillList($("result-decisions"), meeting.summary.decisions, "No decisions recorded.");
  fillList(
    $("result-actions"),
    meeting.summary.action_items.map((item) => (item.owner ? `${item.task} (👤 ${item.owner})` : item.task)),
    "No action items."
  );
  $("open-meeting").href = `${APP_URL}/meetings/${meeting.id}`;
  show("result");
}

function fillList(list, texts, emptyText) {
  list.replaceChildren();
  if (texts.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = emptyText;
    list.append(li);
  }
  for (const text of texts) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
}

// ---------- Google Meet live capture ----------

function sendToMeet(type) {
  return chrome.tabs.sendMessage(meetTabId, { type });
}

async function detectMeet() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    meetTabId = tab.id;
    const status = await sendToMeet("meet:status");
    meetMode = "ready";
    renderMeet(status);
    pollTimer ??= setInterval(refreshMeet, 1000);
  } catch {
    // No capture script answered. If this is a Meet tab, it was opened before the extension loaded.
    meetMode = tab.url?.startsWith("https://meet.google.com/") ? "reload" : null;
    if (meetMode === "reload") renderMeetReload();
  }
}

async function refreshMeet() {
  if ($("meet-panel").hidden || meetMode !== "ready") return;
  try {
    renderMeet(await sendToMeet("meet:status"));
  } catch {
    meetMode = "reload";
    renderMeetReload();
  }
}

function renderMeetReload() {
  $("meet-state").textContent = "Not connected";
  $("meet-state").className = "pill";
  $("meet-hint").textContent = "Refresh this Google Meet tab once, then open the extension again.";
  $("meet-live").hidden = true;
  $("meet-controls").hidden = true;
}

function renderMeet(status) {
  const state = $("meet-state");
  state.textContent = status.capturing ? "🔴 Live" : status.lineCount ? "⏸ Paused" : "Ready";
  state.className = status.capturing ? "pill pill-live" : "pill";

  let hint;
  if (!status.captionsOn) hint = "Turn on captions (the CC button in Meet) so the extension can read them.";
  else if (status.capturing) hint = `Capturing… ${status.lineCount} line${status.lineCount === 1 ? "" : "s"} so far.`;
  else if (status.lineCount) hint = `${status.lineCount} lines captured. Press Start to continue, or Summarize.`;
  else hint = "Captions are on. Press Start capture when the meeting begins.";
  $("meet-hint").textContent = hint;

  const live = $("meet-live");
  live.hidden = status.preview.length === 0;
  live.replaceChildren(
    ...status.preview.map((line) => {
      const [speaker, ...rest] = line.split(": ");
      const p = document.createElement("p");
      const name = document.createElement("strong");
      name.textContent = `${speaker}: `;
      p.append(name, rest.join(": "));
      return p;
    })
  );
  live.scrollTop = live.scrollHeight;

  $("meet-controls").hidden = false;
  $("meet-toggle").textContent = status.capturing ? "⏹ Stop" : "● Start capture";
  $("meet-summarize").disabled = status.lineCount === 0;
}

$("meet-toggle").addEventListener("click", async () => {
  const { capturing } = await sendToMeet("meet:status");
  renderMeet(await sendToMeet(capturing ? "meet:stop" : "meet:start"));
});

$("meet-clear").addEventListener("click", async () => {
  if (!window.confirm("Clear the captured captions?")) return;
  renderMeet(await sendToMeet("meet:clear"));
});

$("meet-summarize").addEventListener("click", async () => {
  const { transcript, title } = await sendToMeet("meet:transcript");
  await summarizeText(transcript, title, $("meet-summarize"));
});

init();
