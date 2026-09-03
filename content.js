// AA GitHub Workflows - content script
// Runs on GitHub PR pages. Provides:
//   - V  : mark the top-most unviewed file as viewed
//   - ⇧V : un-view the last viewed file
//   - mark all test files viewed
//   - copy a formatted PR feed entry to the clipboard (from chrome-feed)
// Actions with no keyboard shortcut are triggered from the popup.

(function () {
  if (window.__AA_GITHUB_WORKFLOWS_LOADED__) return;
  window.__AA_GITHUB_WORKFLOWS_LOADED__ = true;

  // Review mode must be manually toggled ON/OFF. While OFF, the V / Shift+V
  // keys do nothing — you can type freely (e.g. "view" in a comment) without
  // accidentally collapsing files.
  const state = { mode: false };

  // ----- File entry discovery --------------------------------------------------
  // GitHub's diff is a React app: each changed file is wrapped in a container
  // whose class starts with "PullRequestDiffsList-module__diffEntry". Inside it
  // is a "DiffFileHeader" carrying the filename (<h3>) and the "MarkAsViewed"
  // button (aria-pressed / aria-label "Viewed"/"Not Viewed"). We also support
  // the classic data-path layout.
  function getEntryCandidates() {
    const set = new Set();
    // Modern React split view (virtualized): each file is a diffEntry block.
    for (const el of document.querySelectorAll('[class*="PullRequestDiffsList-module__diffEntry"]')) {
      set.add(el);
    }
    for (const el of document.querySelectorAll('[class*="diffEntry"]')) {
      set.add(el);
    }
    // Classic unified view: per-file headers with data-path.
    for (const el of document.querySelectorAll(
      '.js-file-header, .file-header, div[data-path]:not([data-path*="{{"])'
    )) {
      if (el.getAttribute && el.getAttribute("data-path")) set.add(el);
    }
    return [...set];
  }

  function getFilePath(entry) {
    const dp = entry.getAttribute && entry.getAttribute("data-path");
    if (dp) return dp;
    const h3 = entry.querySelector("h3, [class*='DiffFileHeader'] h3");
    if (h3 && h3.textContent.trim()) return h3.textContent.trim();
    const link = entry.querySelector('a[href*="/blob/"], a[href*="/tree/"]');
    if (link && link.getAttribute("title")) return link.getAttribute("title");
    if (link) {
      const href = link.getAttribute("href") || "";
      const m = href.match(/\/blob\/[^/]+\/(.+)$/) || href.match(/\/blob\/[^/]+(.+)$/);
      if (m) return m[1];
      if (link.textContent.trim()) return link.textContent.trim();
    }
    return null;
  }

  // ----- Viewed toggle discovery ----------------------------------------------
  function getViewedToggle(entry) {
    const btns = entry.querySelectorAll("button[aria-label]");
    for (const b of btns) {
      const la = b.getAttribute("aria-label") || "";
      if (/viewed/i.test(la) || (b.className || "").includes("MarkAsViewed")) return b;
    }
    const labeled = entry.querySelectorAll("button, [role='checkbox'], [role='switch'], label, .js-reviewed");
    for (const el of labeled) {
      const text = (el.textContent || "").trim().toLowerCase();
      const la = (el.getAttribute("aria-label") || "").toLowerCase();
      if (text === "viewed" || text === "not viewed" || /viewed/i.test(la) || el.getAttribute("aria-pressed") !== null) {
        return el;
      }
    }
    const cb = entry.querySelector('input[type="checkbox"].js-reviewed-toggle, input[type="checkbox"].js-viewed-file-toggle');
    return cb || null;
  }

  function isViewed(entry) {
    const t = getViewedToggle(entry);
    if (!t) return null;
    if (t.type === "checkbox") return t.checked;
    const pressed = t.getAttribute("aria-pressed");
    if (pressed !== null) return pressed === "true";
    const aria = t.getAttribute("aria-checked");
    if (aria !== null) return aria === "true";
    const text = (t.textContent || "").trim().toLowerCase();
    if (text === "not viewed") return false;
    if (text === "viewed") return true;
    return null;
  }

  function setViewed(entry, wantViewed) {
    const t = getViewedToggle(entry);
    if (!t) return false;
    const currently = isViewed(entry);
    if (currently === wantViewed) return false;
    if (t.type === "checkbox") {
      if (t.checked !== wantViewed) {
        t.click();
        t.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
    const pressed = t.getAttribute("aria-pressed");
    if (pressed !== null && (pressed === "true") !== wantViewed) {
      t.click();
      return true;
    }
    if (t.getAttribute("aria-checked") !== null) {
      t.click();
      return true;
    }
    const text = (t.textContent || "").trim().toLowerCase();
    if (wantViewed && text !== "viewed") { t.click(); return true; }
    if (!wantViewed && text !== "not viewed") { t.click(); return true; }
    return false;
  }

  function getAllFileEntries() {
    const candidates = getEntryCandidates().filter((e) => getFilePath(e));
    // Drop any entry that is nested inside another entry (the broad selector may
    // match both a diffEntry container and an inner header for the same file).
    return candidates.filter((e) => !candidates.some((other) => other !== e && other.contains(e)));
  }

  // ----- Test file detection ---------------------------------------------------
  // Covers *.test.*, *.spec.*, *_test.*, *_spec.*, *-test.*, *-spec.* and
  // __tests__ / __test__ / __specs__ directories (Vitest/Jest style).
  function isTestPath(path) {
    if (!path) return false;
    const name = path.split("/").pop();
    if (/(^|[._-])(__?test__?|__?spec__?)([._-]|$)/i.test(name)) return true;
    if (/(^|[._-])(test|spec|tests|specs)([._-]|$)/i.test(name)) return true;
    if (/^test|^spec|_test$|_spec$|-test$|-spec$/i.test(name)) return true;
    const segments = path.split("/");
    return segments.some((s) => /^_{0,2}(test|spec)s?_?_{0,2}$/i.test(s));
  }

  // GitHub virtualizes the diff list: only a window of entries is mounted at
  // once, and after each "Viewed" collapse the DOM re-flows. So every action
  // must (a) re-query fresh entries, (b) scroll the target into view to force
  // React to mount it, and (c) wait for the re-render to settle before returning.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function scrollEntryIntoView(entry) {
    try {
      entry.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (e) {
      try { entry.scrollIntoView(); } catch (_) {}
    }
  }

  // Pick the first NOT-viewed entry. Waiting one frame lets React mount any
  // freshly-scrolled rows so the "not viewed" state is accurate.
  async function findNextUnviewed() {
    const entries = getAllFileEntries();
    for (const e of entries) {
      if (isViewed(e) === false) return e;
    }
    return null;
  }

  async function viewNext() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = await findNextUnviewed();
      if (!target) return { ok: false, error: "all files already viewed" };
      scrollEntryIntoView(target);
      await sleep(120); // let GitHub mount the row + hydrate its state
      if (isViewed(target) === false && setViewed(target, true)) {
        await sleep(250); // let the collapse re-render settle
        return { ok: true, file: getFilePath(target) };
      }
    }
    return { ok: false, error: "could not view next file" };
  }

  async function viewPrev() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const entries = getAllFileEntries();
      let target = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (isViewed(entries[i]) === true) { target = entries[i]; break; }
      }
      if (!target) return { ok: false, error: "no viewed files to un-view" };
      scrollEntryIntoView(target);
      await sleep(120);
      if (isViewed(target) === true && setViewed(target, false)) {
        await sleep(250);
        return { ok: true, file: getFilePath(target) };
      }
    }
    return { ok: false, error: "could not un-view last file" };
  }

  // Loop that view every unviewed file matching an optional predicate, handling
  // GitHub's virtualized list (re-query each pass + scroll into view).
  async function viewAllMatching(predicate) {
    let count = 0;
    for (let guard = 0; guard < 5000; guard++) {
      const entries = getAllFileEntries();
      let target = null;
      for (const e of entries) {
        if (isViewed(e) === false && (!predicate || predicate(getFilePath(e)))) { target = e; break; }
      }
      if (!target) break;
      scrollEntryIntoView(target);
      await sleep(100);
      if (isViewed(target) === false && setViewed(target, true)) count++;
      await sleep(200);
    }
    return { ok: true, marked: count };
  }

  async function markAllTestsViewed() {
    return viewAllMatching((path) => isTestPath(path));
  }

  async function markAllFilesViewed() {
    return viewAllMatching(null); // every file
  }

  function countTestFiles() {
    const entries = getAllFileEntries();
    let total = 0, unviewed = 0;
    for (const e of entries) {
      if (isTestPath(getFilePath(e))) {
        total++;
        if (isViewed(e) === false) unviewed++;
      }
    }
    return { total, unviewed };
  }

  function getColorMode() {
    return document.documentElement.getAttribute("data-color-mode") || "light";
  }

  // ----- PR feed entry (ported from chrome-feed) -------------------------------
  function isPRPage() {
    return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(window.location.href);
  }

  function getPRState() {
    const badge = document.querySelector('[data-status^="pull"]');
    if (badge) {
      const s = badge.getAttribute("data-status");
      if (s === "pullMerged") return "merged";
      if (s === "pullClosed") return "closed";
      return "open"; // pullOpened, pullDraft
    }
    if (document.querySelector('[class*="State--merged"]')) return "merged";
    if (document.querySelector('[class*="State--closed"]')) return "closed";
    return "open";
  }

  function getPRData() {
    const match = window.location.href.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    const prNumber = match[3];
    const prUrl = `https://github.com/${match[1]}/${match[2]}/pull/${prNumber}`;
    const titleFromPage = document.title.split(" ")[0].trim() && document.title.split(" \u00b7 ")[0].trim();
    const titleEl =
      document.querySelector('[data-component="PH_Title"] span.markdown-title') ||
      document.querySelector("span.markdown-title") ||
      document.querySelector("bdi.js-issue-title") ||
      document.querySelector(".js-issue-title") ||
      document.querySelector("h1 bdi");
    const title = (titleEl && titleEl.textContent.trim()) || titleFromPage;
    if (!title) return null;
    return { title, prNumber, prUrl, state: getPRState() };
  }

  function buildFeedEntry({ title, prNumber, prUrl, state }) {
    const emoji = state === "merged" ? ":merged:" : ":rev:";
    return `${emoji} ${title} #${prNumber}\n${prUrl}`;
  }

  // ----- Toast (ported from chrome-feed) --------------------------------------
  function showToast(message, isError = false) {
    const existing = document.getElementById("aa-github-workflows-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "aa-github-workflows-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      padding: "10px 18px",
      borderRadius: "8px",
      fontSize: "14px",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight: "500",
      color: "#fff",
      background: isError ? "#cf222e" : "#1a7f37",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      transition: "opacity 0.3s ease",
      opacity: "1",
      pointerEvents: "none",
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  async function copyFeedEntry() {
    if (!isPRPage()) return { ok: false, error: "not a PR page" };
    const data = getPRData();
    if (!data) return { ok: false, error: "could not read PR" };
    const entry = buildFeedEntry(data);
    const ok = await copyToClipboard(entry);
    showToast(ok ? `Copied feed entry for #${data.prNumber}` : "Failed to copy to clipboard.", !ok);
    return { ok, entry };
  }

  // ----- In-page keys: V / Shift+V (only while review mode is ON) --------------
  const PR_DIFF_RE = /github\.com\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/;

  let badgeEl = null;
  function ensureBadge() {
    if (!badgeEl) {
      badgeEl = document.createElement("div");
      badgeEl.id = "aa-github-workflows-mode-badge";
      badgeEl.style.cssText =
        "position:fixed;bottom:16px;left:16px;z-index:2147483647;padding:7px 13px;" +
        "border-radius:999px;font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
        "color:#fff;background:#238636;box-shadow:0 2px 8px rgba(0,0,0,.4);" +
        "display:none;align-items:center;gap:6px;pointer-events:none;";
      badgeEl.textContent = "● Review mode ON — V view next · ⇧V un-view";
      document.documentElement.appendChild(badgeEl);
    }
    badgeEl.style.display = state.mode ? "flex" : "none";
  }

  function setMode(on) {
    state.mode = !!on;
    ensureBadge();
    return state.mode;
  }

  let keyBusy = false;

  function onKeyDown(e) {
    if (!state.mode) return; // mode OFF — V does nothing
    // Never intercept keys while typing in an editable field.
    const tag = (e.target && e.target.tagName) || "";
    if (/^INPUT$|^TEXTAREA$|^SELECT$/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== "v" && e.key !== "V") return;
    if (!PR_DIFF_RE.test(window.location.href)) return;

    e.preventDefault();
    if (keyBusy) return; // still processing the previous press
    keyBusy = true;
    const shift = e.shiftKey;
    (async () => {
      try {
        const r = shift ? await viewPrev() : await viewNext();
        showToast(r.ok ? (shift ? `Un-viewed ${r.file}` : `Viewed ${r.file}`) : r.error, !r.ok);
      } finally {
        keyBusy = false;
      }
    })();
  }

  document.addEventListener("keydown", onKeyDown, true);

  // ----- Feed copy shortcut: Cmd+Shift+F (any PR page) -------------------------
  // Matches chrome-feed. Works regardless of review mode and even while typing.
  const PR_PAGE_RE = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

  function onFeedKeyDown(e) {
    if (!(e.metaKey && e.shiftKey && e.key.toLowerCase() === "f")) return;
    if (!PR_PAGE_RE.test(window.location.href)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    copyFeedEntry();
  }

  document.addEventListener("keydown", onFeedKeyDown, true);

  // ----- Message router -------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg && msg.action) {
      case "ping":
        sendResponse({ ok: true, pong: true });
        return false;
      case "toggle-mode":
        sendResponse({ ok: true, mode: setMode(!state.mode) });
        return false;
      case "set-mode":
        sendResponse({ ok: true, mode: setMode(!!(msg.value)) });
        return false;
      case "get-state":
        sendResponse({ ok: true, mode: state.mode, files: getAllFileEntries().length, ...countTestFiles() });
        return false;
      case "view-next-file":
        viewNext().then(sendResponse);
        return true; // async
      case "view-prev-file":
        viewPrev().then(sendResponse);
        return true; // async
      case "mark-all-tests-viewed":
        markAllTestsViewed().then(sendResponse);
        return true; // async
      case "mark-all-files-viewed":
        markAllFilesViewed().then(sendResponse);
        return true; // async
      case "copy-feed-entry":
        copyFeedEntry().then(sendResponse);
        return true; // async
      case "count-test-files":
        sendResponse({ ok: true, ...countTestFiles() });
        return false;
      case "get-color-mode":
        sendResponse({ ok: true, mode: getColorMode() });
        return false;
      default:
        sendResponse({ ok: false, error: "unknown action" });
        return false;
    }
  });

  // ----- SPA navigation: re-evaluate on GitHub client-side tab switches ---
  // GitHub swaps PR tabs (conversation ⇄ files ⇄ changes) without a full page
  // load, so the content script never re-runs. Watch the URL and re-apply
  // review mode + auto-mark whenever it transitions onto a diff page.
  let lastUrl = window.location.href;

  function onUrlChange() {
    const url = window.location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    const isDiff = PR_DIFF_RE.test(url);
    // Sync review mode to the new page (auto-ON on diff pages, OFF elsewhere).
    if (state.mode !== isDiff) setMode(isDiff);
    if (isDiff) autoMarkTestsViewed();
  }

  // GitHub drives navigation through the History API.
  const _pushState = history.pushState;
  history.pushState = function (...args) {
    _pushState.apply(this, args);
    onUrlChange();
  };
  const _replaceState = history.replaceState;
  history.replaceState = function (...args) {
    _replaceState.apply(this, args);
    onUrlChange();
  };
  window.addEventListener("popstate", onUrlChange);
  // Safety net: poll for title/URL changes GitHub may not route through history.
  setInterval(onUrlChange, 1000);

  console.log("[AA GitHub Workflows] content script injected");
})();
