# Relay Miden — Permanent Development Policies

## Rule A — Read project context

Before each implementation, read this file and README.md, inspect relevant code, and review recent files in docs/history/. The current phase and existing behavior constrain all work.

## Rule B — Append-only execution history

Every Codex execution must create a new Markdown history file in docs/history/ using `phase-XX-YYYYMMDDTHHMMSSZ-unique.md`. Use UTC and a unique suffix, including for retries and follow-up fixes. Never overwrite, reuse, delete, or modify an existing history file. Create the file even when work fails or is incomplete. Include the full user prompt when available, or explicitly identify the objective when the original prompt is unavailable. Include all headings below:

```markdown
# Relay Miden — Execution History

## Phase

## Timestamp

## Prompt / Objective

## Summary

## Files Created

## Files Modified

## Implementation Details

## Commands Executed

## Tests and Results

## Bugs Fixed

## Known Issues

## Remaining Work

## Recommended Next Steps
```

## Rule C — Update README after every execution

After every Codex prompt, update README.md cumulatively: completed features, current phase, setup instructions, architectural changes, limitations, actual testing status, and a link to the new history entry. Do not remove previously valid information without documenting the reason.

## Rule D — Centralized palette

All four brand colors belong in `apps/web/src/styles/palette.css`. Components must use CSS variables or Tailwind tokens derived from that file. Define functional colors centrally too. Metric icons and priority/status indicators must not have colored background fills or badge/pill treatments.

## Rule E — Preserve existing functionality

Preserve existing user files and functionality. Avoid unnecessary rewrites, breaking changes, and unrelated modifications.

## Rule F — Testing

Run relevant checks and record actual results. Never claim unexecuted tests passed. For UI work, verify routes and representative responsive widths, keyboard access, horizontal overflow, and visual consistency. Report unavailable checks explicitly.

## Rule G — No Git commands

Do not execute any Git command, including init, add, commit, push, pull, checkout, reset, status, diff, or log. Git operations are handled manually by the user.

## Rule H — Scope discipline

Implement only the current authorized phase unless a small prerequisite is necessary. Do not implement future phases prematurely. Phase 1 is architecture and visual UI only: no IndexedDB persistence, QR encoding/decoding, camera access, LAN transport, synchronization, or service worker. Always identify demonstration data and unsaved previews honestly.
