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

  // Review mode auto-enables on PR diff/changes pages. While OFF (or on other
  // PR tabs), the V / Shift+V keys do nothing — you can type freely (e.g. "view"
  // in a comment) without accidentally collapsing files.
  const PR_DIFF_RE = /github\.com\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)\/?$/;
  const state = { mode: PR_DIFF_RE.test(window.location.href) };

  // ----- File entry discovery --------------------------------------------------
  // GitHub's diff view: find all "Viewed" toggle buttons, then walk up to the
  // file container and extract the filename. This avoids depending on GitHub's
  // CSS module class names, which change every deploy.
  function getAllViewedToggles() {
    const toggles = [];
    // GitHub's "Viewed" button: aria-label starts with "Viewed" or "Not viewed"
    for (const b of document.querySelectorAll("button[aria-label]")) {
      const la = (b.getAttribute("aria-label") || "").toLowerCase();
      if (/^(viewed|not viewed)/i.test(la) || b.getAttribute("aria-pressed") !== null) {
        toggles.push(b);
      }
    }
    return toggles;
  }

  function getFilePathFromToggle(toggle) {
    // Walk up to the file header/container. The filename is usually in an <a>
    // with a title or href pointing at the blob, or in a data-path attribute.
    let el = toggle;
    for (let i = 0; i < 12 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      // data-path is the most reliable.
      const dp = el.getAttribute && el.getAttribute("data-path");
      if (dp) return dp;
      // Look for a blob link with a title.
      const link = el.querySelector('a[href*="/blob/"]');
      if (link) {
        const title = link.getAttribute("title");
        if (title && title.includes("/")) return title;
        const href = link.getAttribute("href") || "";
        const m = href.match(/\/blob\/[^/]+\/(.+)$/);
        if (m) return m[1];
      }
    }
    // Fallback: use any blob link on the page near this toggle.
    const anyLink = toggle.closest('[data-path]');
    if (anyLink) return anyLink.getAttribute("data-path");
    return null;
  }

  function getAllFileEntries() {
    return getAllViewedToggles().map((t) => ({ toggle: t, path: getFilePathFromToggle(t) }));
  }

  // Legacy alias — some functions expect entry objects with a "toggle" inside.
  function getViewedToggle(entry) {
    if (entry && entry.toggle) return entry.toggle;
    return entry;
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
    const el = entry.toggle || entry;
    try {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    } catch (e) {
      try { el.scrollIntoView(); } catch (_) {}
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
        return { ok: true, file: target.path };
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
        return { ok: true, file: target.path };
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
        if (isViewed(e) === false && (!predicate || predicate(e.path))) { target = e; break; }
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
      if (isTestPath(e.path)) {
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
      badgeEl.textContent = "● Review mode — V view next · ⇧V un-view";
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

  // Show the badge immediately if review mode is auto-enabled on this page.
  ensureBadge();

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

  // ----- Auto-mark test files viewed on PR diff pages -----------------------
  // GitHub virtualizes the diff list and hydrates rows on a timer, so we retry
  // in short bursts until there are no more unviewed test files or we time out.
  async function autoMarkTestsViewed() {
    if (!PR_DIFF_RE.test(window.location.href)) return;
    // Give GitHub a moment to mount the initial diff rows.
    await sleep(800);
    let totalMarked = 0;
    const deadline = Date.now() + 30000; // 30s cap
    while (Date.now() < deadline) {
      const before = countTestFiles().unviewed;
      if (before === 0) break;
      const r = await markAllTestsViewed();
      if (!r.ok) break;
      totalMarked += r.marked;
      // If nothing changed this pass, the list is done (or stalled).
      const after = countTestFiles().unviewed;
      if (after === before) break;
      await sleep(400);
    }
    if (totalMarked > 0) {
      showToast(`Auto-marked ${totalMarked} test file(s) viewed`);
    }
  }

  // Kick off auto-marking. Runs in the background; the user can still press V.
  autoMarkTestsViewed();

  console.log("[AA GitHub Workflows] content script injected");
})();
