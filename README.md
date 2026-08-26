# AA GitHub Workflows

A Chrome extension that makes reviewing GitHub Pull Requests faster. It combines two tools into one:

1. **PR diff review** — quickly mark files as viewed so they collapse, one by one or in bulk.
2. **PR feed entry** — copy a formatted Slack/chat feed entry for any PR to your clipboard.

Everything is driven from a clickable popup, plus two in-page keyboard shortcuts (V / Shift+V) while you're on the PR diff.

---

## Features

### 1. View files in a PR diff

GitHub lets you flip each changed file to **"Viewed"**, which collapses its diff. That's the "I've already looked at this" marker. AA GitHub Workflows does it for you:

- **View next file** — marks the top-most unviewed file as viewed (collapses it).
- **Un-view last file** — un-views the most recently viewed file (the opposite of the above).
- **Mark all test files viewed** — flips every test file to viewed in one click, leaving non-test files alone.

#### In-page keyboard shortcuts (diff view only)

While you're on the PR diff page (`/files` or `/changes`), the extension listens for plain keys:

| Key | Action |
| --- | ------ |
| `V` | Mark the next unviewed file as viewed |
| `Shift` + `V` | Un-view the last viewed file |

These are intentionally **not** global shortcuts — they only fire while you're on the PR diff page and not typing in an input. No ⌘/Ctrl modifier is needed.

### 2. Mark all test files viewed

A "test file" is any changed file in the PR whose path matches a common test naming convention, case-insensitively:

- Filename patterns: `*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*`, `*-test.*`, `*-spec.*`
- Directory patterns: `tests/`, `test/`, `spec/`, `__tests__/`, `__test__/`, `__specs__/`

Examples that count as tests:
- `src/utils/math.spec.ts`
- `src/components/Button_test.tsx`
- `tests/unit/math.test.js`
- `tests/unit/parse_test.py`
- `tests/unit/util_spec.rb`

### 3. Copy a PR feed entry

On any GitHub PR page, copy a formatted entry to your clipboard so you can paste it into Slack, Discord, or any chat. Press **Cmd+Shift+F** (or use the popup button) to copy. The format is two lines:

```
:merged: Fix login bug #42
https://github.com/owner/repo/pull/42
```

- `:merged:` — the PR is merged
- `:rev:` — the PR is open or closed (not merged)
- The PR link is on its own second line.

---

## The popup

Click the **AA GitHub Workflows** toolbar icon to open the popup. It shows live stats and one-click actions:

- **View next** / **Un-view last** — the two most common review actions.
- **Files / Tests / Unviewed** counts — how many files changed, how many are test files, and how many of those are still unviewed.
- **Mark all test files viewed** — bulk action for the test files.
- **Copy PR feed entry** — grab the chat feed entry.

The popup styles itself to match GitHub's light or dark theme automatically.

---

## What it does NOT do

- It does **not** add any global Chrome keyboard shortcuts (so it never collides with Chrome, other extensions, or your OS). All key handling is in-page, scoped to GitHub PR pages: V / Shift+V on a PR diff, and Cmd+Shift+F on any PR page.
- It does **not** approve or merge PRs — it only flips the "Viewed" marker and copies feed entries.

---

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`chrome-extension-github-workflows`).

---

## Permissions

- `activeTab` — run the content script on the active GitHub tab.
- `scripting` — inject the content script if it isn't present yet (so the popup always works).
- `clipboardWrite` — copy the PR feed entry to your clipboard.
- `storage` — reserved for settings.

---

## How it works

- **`content.js`** runs on GitHub PR pages. It finds each changed file by its diff-entry container (modern React split view) or its classic `data-path` file header, locates the per-file "Mark as viewed" toggle, and toggles it. It also reads the PR title/state/number/URL to build the feed entry, and handles V / Shift+V.
- **`background.js`** (service worker) routes popup actions to the active tab and auto-injects the content script when needed.
- **`popup.html` / `popup.js`** provide the clickable UI and live stats.

The extension supports both GitHub diff layouts:
- The newer **split view** (`/changes`), where the "Viewed" toggle is a button with `aria-pressed`.
- The older **unified view** (`/files`), where each file has a `data-path` header.

---

## Troubleshooting

- **V / Shift+V don't do anything** — make sure you're on the PR diff page (`/files` or `/changes`) and not typing in a search box. The keys only work on the diff page.
- **"Are you signed in?"** — GitHub only shows the per-file "Viewed" toggle when you're signed in. Sign in to GitHub for the view/un-view actions to work.
- **No file counts** — the popup needs the content script; it auto-injects on the active tab. Reload the PR page if counts stay at `–`.

## License

MIT
