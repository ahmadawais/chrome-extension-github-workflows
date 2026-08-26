// AA GitHub Workflows - background service worker
// Routes popup actions to the active GitHub tab's content script,
// auto-injecting the content script if it isn't present yet.
// (V / Shift+V are handled inside the content script — no global shortcuts.)

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    } catch (err) {
      // Not an injectable page (e.g. chrome://) — caller will surface the error.
    }
  }
}

async function sendToContentScript(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { ok: false, error: "no active tab" };
  await ensureContentScript(tab.id);
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action });
    return resp || { ok: false, error: "no response" };
  } catch (e) {
    return { ok: false, error: "not a GitHub PR page", detail: e.message };
  }
}

// Popup messages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "run-action") {
    sendToContentScript(msg.action).then(sendResponse);
    return true; // async
  }
  return false;
});
