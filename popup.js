// AA GitHub Workflows - popup logic

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function showError(msg) {
  $("error").style.display = "block";
  $("error").textContent = msg;
  $("content").style.display = "none";
}

async function sendAction(action, extra = {}) {
  return chrome.runtime.sendMessage({ type: "run-action", action, ...extra });
}

function isGitHubPR(url) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(\/.*)?/.test(url);
}

function renderMode(mode) {
  const ind = $("mode-indicator");
  const on = !!mode;
  ind.classList.toggle("on", on);
  $("mode-dot").className = "dot";
  $("mode-label").innerHTML = on
    ? "<b>Review mode on</b><span class='mode-hint'>V view next · ⇧V un-view</span>"
    : "<b>Review mode off</b><span class='mode-hint'>V / ⇧V disabled</span>";
  $("toggle-mode").textContent = on ? "Turn off" : "Turn on";
  $("view-next").disabled = !on;
  $("view-prev").disabled = !on;
}

function renderState(s) {
  $("total-files").textContent = s.files ?? "–";
  $("total-tests").textContent = s.total ?? "–";
  $("unviewed-tests").textContent = s.unviewed ?? "–";
  if ("mode" in s) renderMode(s.mode);
}

// Match GitHub's color mode so the popup feels native.
async function applyColorMode() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const mode = tab && tab.url && /^https:\/\/github\.com/.test(tab.url)
      ? (await chrome.tabs.sendMessage(tab.id, { action: "get-color-mode" }))?.mode
      : "dark";
    document.body.dataset.colorMode = mode === "light" ? "light" : "dark";
  } catch (e) {
    // Default to dark on failure.
  }
}

async function refresh() {
  const resp = await sendAction("get-state");
  if (resp && resp.ok) renderState(resp);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !isGitHubPR(tab.url)) {
    showError("Open a GitHub Pull Request page to use this extension.");
    return;
  }
  applyColorMode();
  refresh();

  $("toggle-mode").addEventListener("click", async () => {
    const resp = await sendAction("toggle-mode");
    if (resp && resp.ok) {
      renderMode(resp.mode);
      setStatus(resp.mode ? "Review mode ON. V = view next, ⇧V = un-view." : "Review mode OFF. V types normally now.", "ok");
    } else {
      setStatus((resp && resp.error) || "Failed to toggle mode.", "err");
    }
  });

  $("view-next").addEventListener("click", async () => {
    const resp = await sendAction("view-next-file");
    if (resp && resp.ok) {
      setStatus(resp.file ? `Viewed ${resp.file}` : "Viewed next file", "ok");
    } else if (resp && resp.error === "all files already viewed") {
      setStatus("All files already viewed.", "ok");
    } else {
      setStatus((resp && resp.error) || "Failed to view next file.", "err");
    }
    refresh();
  });

  $("view-prev").addEventListener("click", async () => {
    const resp = await sendAction("view-prev-file");
    if (resp && resp.ok) {
      setStatus(resp.file ? `Un-viewed ${resp.file}` : "Un-viewed last file", "ok");
    } else if (resp && resp.error === "no viewed files to un-view") {
      setStatus("No viewed files to un-view.", "ok");
    } else {
      setStatus((resp && resp.error) || "Failed to un-view last file.", "err");
    }
    refresh();
  });

  $("mark-tests").addEventListener("click", async () => {
    const resp = await sendAction("mark-all-tests-viewed");
    if (resp && resp.ok) {
      setStatus(`Marked ${resp.marked} test file(s) viewed.`, "ok");
    } else {
      setStatus((resp && resp.error) || "Failed to mark tests. Are you signed in?", "err");
    }
    refresh();
  });

  $("copy-feed").addEventListener("click", async () => {
    const resp = await sendAction("copy-feed-entry");
    if (resp && resp.ok) {
      setStatus("Copied PR feed entry to clipboard.", "ok");
    } else {
      setStatus((resp && resp.error) || "Failed to copy feed entry.", "err");
    }
  });

  $("open-shortcuts").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
}

init();
