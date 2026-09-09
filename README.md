# AA GitHub Workflows

A Chrome extension that speeds up GitHub PR review. It combines two tools:

1. **PR diff review** — mark files as viewed so they collapse, one by one or in bulk.
2. **PR feed entry** — copy a formatted Slack/chat entry for any PR to your clipboard.

Drive everything from the popup, or use the in-page shortcuts: **V / Shift+V** on the PR diff, and **Cmd+Shift+F** on any PR page.

On diff pages (`/files` or `/changes`), **review mode turns on automatically** and **all test files are marked viewed on page load** — open a PR's changes and just start reviewing.

---

## Features

### 1. View files in a PR diff

- **Auto on diff pages** — opening/refreshing `/files` or `/changes` enables review mode and marks all test files viewed.
- **View next file** — marks the top-most unviewed file as viewed (collapses it).
- **Un-view last file** — un-views the most recently viewed file.
- **Mark all test files viewed** — flips every test file in one click, leaving non-test files alone.
- **Mark all files viewed** — flips every changed file in one click.

### 2. Keyboard shortcuts (diff view only)

| Key | Action |
| --- | ------ |
| `V` | Mark the next unviewed file as viewed |
| `Shift` + `V` | Un-view the last viewed file |

Review mode is auto-enabled on diff pages, so V / ⇧V work immediately. On other PR tabs it stays off so you can type freely. Toggle it manually from the popup. These are intentionally **not** global shortcuts — no ⌘/Ctrl modifier needed.

### 3. Mark all test files viewed

A "test file" is a changed file whose path matches a common test naming convention (case-insensitive):

- Filename: `*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*`, `*-test.*`, `*-spec.*`
- Directory: `tests/`, `test/`, `spec/`, `__tests__/`, `__test__/`, `__specs__/`

Examples: `src/utils/math.spec.ts`, `src/components/Button_test.tsx`, `tests/unit/math.test.js`.

### 4. Copy a PR feed entry

On any PR page, copy a formatted entry to your clipboard with **Cmd+Shift+F** (or the popup button):

```
:merged: Fix login bug #42
https://github.com/owner/repo/pull/42
```

`:merged:` = merged, `:rev:` = open or closed.

---

## The popup

Click the toolbar icon for live stats and one-click actions: **View next** / **Un-view last**, **Files / Tests / Unviewed** counts, **Mark all files viewed** / **Mark all test files viewed**, and **Copy PR feed entry**. It auto-matches GitHub's light or dark theme.

---

## What it does NOT do

- No global Chrome shortcuts — all key handling is in-page and scoped to GitHub PR pages.
- Doesn't approve or merge PRs — it only flips the "Viewed" marker and copies feed entries.

---

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

---

## Permissions

- `activeTab` — run the content script on the active GitHub tab.
- `scripting` — inject the content script if missing.
- `clipboardWrite` — copy the PR feed entry.
- `storage` — reserved for settings.

---

## How it works

- **`content.js`** — runs on GitHub PR pages. Finds each changed file by its diff container, locates its "Mark as viewed" toggle, and toggles it. Reads the PR title/state/number/URL for the feed entry, and handles V / Shift+V.
- **`background.js`** — service worker routing popup actions to the active tab.
- **`popup.html` / `popup.js`** — the clickable UI and live stats.

Supports both GitHub layouts: the newer **split view** (`/changes`) and the older **unified view** (`/files`).

---

## Troubleshooting

- **V / Shift+V don't work** — review mode may be off. It auto-enables on `/files` and `/changes`; refresh the diff page to retrigger, or toggle it in the popup. Make sure you're not typing in a search box.
- **"Are you signed in?"** — GitHub hides the per-file "Viewed" toggle when signed out. Sign in.
- **No file counts** — the popup needs the content script; reload the PR page if counts stay at `–`.

## License

MIT