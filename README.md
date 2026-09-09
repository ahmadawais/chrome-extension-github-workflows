# AA GitHub Workflows

A Chrome extension that makes GitHub PR review faster:

1. **PR diff review** — mark files as viewed (one by one or in bulk) so they collapse.
2. **PR feed entry** — copy a formatted Slack/chat entry for any PR.

On diff pages (`/files` or `/changes`), review mode auto-enables and test files are marked viewed on load — open a PR's changes and start reviewing.

## Features

### View files in a PR diff

GitHub's "Viewed" flag collapses a file's diff. This extension automates it:

- **Auto on diff pages** — review mode enables itself on `/files` or `/changes` and marks all test files viewed.
- **View next file** — marks the top-most unviewed file as viewed.
- **Un-view last file** — undoes the last view.
- **Mark all test files viewed** / **Mark all files viewed** — bulk actions.

#### Keyboard shortcuts (diff view only)

| Key | Action |
| --- | ------ |
| `V` | Mark the next unviewed file as viewed |
| `Shift` + `V` | Un-view the last viewed file |

These are in-page only (no ⌘/Ctrl modifier, no global shortcuts). Review mode is auto-enabled on diff pages and stays off elsewhere so you can type freely. Toggle it manually from the popup if needed.

### Test file detection

A changed file counts as a test file if its path matches a common test naming convention (case-insensitive):

- Filename: `*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*`, `*-test.*`, `*-spec.*`
- Directory: `tests/`, `test/`, `spec/`, `__tests__/`, `__test__/`, `__specs__/`

Examples: `src/utils/math.spec.ts`, `src/components/Button_test.tsx`, `tests/unit/math.test.js`

### Copy a PR feed entry

On any PR page, press **Cmd+Shift+F** (or use the popup) to copy a two-line entry for Slack/Discord:

```
:merged: Fix login bug #42
https://github.com/owner/repo/pull/42
```

- `:merged:` — PR is merged; `:rev:` — open or closed.

## The popup

Click the toolbar icon for live stats and one-click actions:

- **View next** / **Un-view last** — common review actions.
- **Files / Tests / Unviewed** counts.
- **Mark all files viewed** / **Mark all test files viewed** — bulk actions.
- **Copy PR feed entry**.

The popup matches GitHub's light or dark theme automatically.

## What it does NOT do

- No global Chrome keyboard shortcuts — all key handling is in-page, scoped to GitHub PR pages (V / Shift+V on diffs, Cmd+Shift+F on any PR page).
- No approve or merge — it only flips "Viewed" and copies feed entries.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Permissions

- `activeTab` — run the content script on the active GitHub tab.
- `scripting` — inject the content script if needed (popup always works).
- `clipboardWrite` — copy feed entries.
- `storage` — reserved for settings.

## How it works

- **`content.js`** runs on GitHub PR pages: finds each changed file (modern split view or classic `data-path` header), toggles "Viewed", reads PR info for feed entries, and handles V / Shift+V.
- **`background.js`** (service worker) routes popup actions to the active tab and auto-injects the content script.
- **`popup.html` / `popup.js`** — clickable UI and live stats.

Supported layouts:
- **Split view** (`/changes`) — "Viewed" is a button with `aria-pressed`.
- **Unified view** (`/files`) — files have a `data-path` header.

## Troubleshooting

- **V / Shift+V don't work** — review mode may be off (other PR tabs stay off). Toggle it in the popup or refresh the diff page. Make sure you're not typing in a search box.
- **"Are you signed in?"** — GitHub only shows the "Viewed" toggle when signed in.
- **No file counts** — reload the PR page to trigger content-script injection.

## License

MIT
