// Content script for meet.google.com: reads Google Meet's live captions and builds a transcript.
//
// Google Meet has no public API for captions, so this reads them from the page itself.
// Meet's HTML can change without notice. If capture stops working, open Meet with captions on,
// right-click a caption → Inspect, and update the selectors in SELECTORS below.
(() => {
  const SELECTORS = {
    // The box that holds all caption lines.
    region: ['div[role="region"][aria-label="Captions"]', 'div[jsname="dsyhDe"]', ".a4cQT"],
    // One caption block = one speaker's turn.
    block: [".nMcdL", ".TBMuR"],
    speaker: [".NWpY1d", ".zs7s8d"],
    text: [".ygicle", ".iTTPOb"],
  };

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function first(root, selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function findBlocks(region) {
    for (const selector of SELECTORS.block) {
      const blocks = region.querySelectorAll(selector);
      if (blocks.length) return [...blocks];
    }
    // Fallback when Meet renames its classes: a block is the smallest element whose text has
    // two or more lines ("Speaker name" on the first line, what they said after it).
    const lineCount = (el) => el.innerText.split("\n").filter((l) => l.trim()).length;
    return [...region.querySelectorAll("div")].filter(
      (el) => lineCount(el) >= 2 && ![...el.children].some((child) => lineCount(child) >= 2)
    );
  }

  function readBlock(block) {
    const speakerEl = first(block, SELECTORS.speaker);
    const textEl = first(block, SELECTORS.text);
    if (speakerEl && textEl) {
      return { speaker: clean(speakerEl.textContent), text: clean(textEl.textContent) };
    }
    const lines = block.innerText.split("\n").map(clean).filter(Boolean);
    if (lines.length < 2) return null;
    return { speaker: lines[0], text: lines.slice(1).join(" ") };
  }

  // Meet keeps editing a caption while the person is talking (adding words, fixing words),
  // and for long turns it drops the oldest words from the start. Keep everything we've seen.
  function mergeText(oldText, newText) {
    if (!oldText) return newText;
    const probe = newText.slice(0, 30);
    const index = probe.length >= 10 ? oldText.indexOf(probe) : -1;
    return index > 0 ? oldText.slice(0, index) + newText : newText;
  }

  // ---------- Capture state ----------

  let entries = []; // [{ speaker, text }] in the order people spoke
  let seen = new WeakMap(); // caption block element -> its entry
  let observer = null;
  let capturing = false;
  let startedAt = null;
  let scanQueued = false;

  function scan() {
    scanQueued = false;
    const region = first(document, SELECTORS.region);
    if (!region) return;

    for (const block of findBlocks(region)) {
      const parsed = readBlock(block);
      if (!parsed || !parsed.text) continue;

      const entry = seen.get(block);
      if (entry) {
        entry.speaker = parsed.speaker || entry.speaker;
        entry.text = mergeText(entry.text, parsed.text);
      } else {
        const newEntry = { speaker: parsed.speaker || "Unknown", text: parsed.text };
        entries.push(newEntry);
        seen.set(block, newEntry);
      }
    }
  }

  function queueScan() {
    // Captions change many times per second; scan at most every 250ms.
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(scan, 250);
  }

  function start() {
    if (capturing) return;
    capturing = true;
    startedAt = startedAt ?? Date.now();
    observer = new MutationObserver(queueScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    notifyBadge();
  }

  function stop() {
    if (!capturing) return;
    scan();
    observer.disconnect();
    observer = null;
    capturing = false;
    notifyBadge();
  }

  function clear() {
    entries = [];
    seen = new WeakMap();
    startedAt = capturing ? Date.now() : null;
  }

  function lines() {
    return entries.filter((e) => e.text).map((e) => `${e.speaker}: ${e.text}`);
  }

  function status() {
    const meetingCode = location.pathname.replace(/^\//, "").split("/")[0] || "";
    return {
      capturing,
      captionsOn: Boolean(first(document, SELECTORS.region)),
      lineCount: lines().length,
      preview: lines().slice(-6),
      meetingCode,
      startedAt,
    };
  }

  function transcript() {
    const code = status().meetingCode;
    const date = new Date(startedAt ?? Date.now()).toLocaleString();
    return {
      transcript: lines().join("\n"),
      title: `Google Meet${code ? ` ${code}` : ""} – ${date}`,
    };
  }

  function notifyBadge() {
    if (globalThis.chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "meet:badge", capturing }).catch(() => {});
    }
  }

  // ---------- Messages from the popup ----------

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case "meet:status":
          sendResponse(status());
          break;
        case "meet:start":
          start();
          sendResponse(status());
          break;
        case "meet:stop":
          stop();
          sendResponse(status());
          break;
        case "meet:clear":
          clear();
          sendResponse(status());
          break;
        case "meet:transcript":
          scan();
          sendResponse(transcript());
          break;
        default:
          return false;
      }
      return false;
    });
  }

  // Lets the local test page (dev/fake-meet.html) drive the capture without Chrome APIs.
  globalThis.__meetCaptionCapture = { start, stop, clear, status, transcript, scan };
})();
