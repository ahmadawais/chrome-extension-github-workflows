# AA GitHub Workflows

A Chrome extension that speeds up GitHub PR review. Two tools in one:

- **PR diff review** — mark files as viewed, one by one or in bulk.
- **PR feed entry** — copy a formatted chat entry for any PR.

On diff pages (`/files` or `/changes`) review mode turns on automatically and all test files are pre-marked viewed, so you can start reviewing immediately.

---

## Features

### Review a PR diff

Use the popup or keyboard shortcuts:

| Key | Action |
| --- | ------ |
| `V` | Mark the next unviewed file as viewed |
| `Shift` + `V` | Un-view the last viewed file |
| `Cmd` + `Shift` + `F` | Copy the PR feed entry |

The popup shows live **files / tests / unviewed** counts and one-click actions: view next, un-view last, and bulk-mark all files or just test files. Shortcuts only fire on PR diff pages, never while typing — no global key binding, so nothing collides with Chrome or your OS.

### Test files

A "test file" matches common naming, case-insensitive:

- Patterns: `*.test.*`, `*.spec.*`, `*_test.*`, `*_spec.*`, `*-test.*`, `*-spec.*`
- Directories: `tests/`, `test/`, `spec/`, `__tests__/`, `__test__/`, `__specs__/`

### Copy a PR feed entry

On any PR page, copy a two-line Slack/chat entry:

```
:merged: Fix login bug #42
https://github.com/owner/repo/pull/42
```

`:merged:` when merged, `:rev:` when open or closed.

---

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Permissions

- `activeTab` + `scripting` — run/inject the content script on GitHub tabs
- `clipboardWrite` — copy the feed entry
- `storage` — reserved for settings

## How it works

- **`content.js`** — runs on GitHub PR pages, finds each file (split view `/changes` or classic `/files`), toggles its "Viewed" marker, and handles shortcuts.
- **`background.js`** — routes popup actions and auto-injects the content script.
- **`popup.html` / `popup.js`** — the UI and live stats.

## Troubleshooting

- **V / Shift+V do nothing** — review mode is off. It auto-enables on `/files` / `/changes`; otherwise toggle it from the popup or refresh the diff page. Don't type in a search box while using the keys.
- **"Are you signed in?"** — the "Viewed" toggle only shows when signed in.
- **No file counts** — reload the PR page so the content script can inject.

## License

MIT