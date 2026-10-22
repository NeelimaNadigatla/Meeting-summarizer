// Background service worker: runs the right-click menu and does the summarizing.
// Summaries run here (not in the popup) so they keep going even if the popup closes.
import { summarize } from "./api.js";
import { APP_URL } from "./config.js";

const MENU_ID = "summarize-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Summarize meeting text",
    contexts: ["selection"],
  });
});

// Right-click → "Summarize meeting text"
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const text = await getSelectedText(info, tab);
  try {
    const meeting = await runSummary(text, tab?.title);
    chrome.tabs.create({ url: `${APP_URL}/meetings/${meeting.id}` });
  } catch {
    // runSummary already saved the error for the popup to show.
  }
});

// Messages from the popup and the Meet content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "meet:badge" && sender.tab) {
    // Show a red "REC" on the icon while captions are being captured in that tab.
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.capturing ? "REC" : "" });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#dc2626" });
    return false;
  }
  if (message.type !== "summarize") return false;
  runSummary(message.transcript, message.title)
    .then((meeting) => sendResponse({ ok: true, meeting }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep the message channel open for the async response
});

async function runSummary(transcript, title) {
  await setBadge("…", "#4f46e5");
  try {
    const meeting = await summarize(transcript, title);
    await chrome.storage.local.remove("lastError");
    await setBadge("", "#4f46e5");
    return meeting;
  } catch (err) {
    await chrome.storage.local.set({ lastError: err.message });
    await setBadge("!", "#dc2626");
    throw err;
  }
}

// info.selectionText can lose line breaks, so first try reading the selection from the page.
async function getSelectedText(info, tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });
    if (result?.result?.trim()) return result.result;
  } catch {
    // Some pages (like chrome:// pages) don't allow scripts. Fall back below.
  }
  return info.selectionText ?? "";
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}
