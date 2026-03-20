# Issues / Work Log

## Entries

### 2026-03-20 - #38: Bold text lost when unwrapping list item via marker deletion
- **Status**: Completed
- **Description**: Inline formatting lost during structural edits. Root cause was three interacting issues in the inline-source plugin (ENTER timing, input rule interference, backspace boundary handling).
- **URL**: https://github.com/bhendo/skriv/issues/38
- **Notes**: Fix in commit c23f547 on feature/phase-2-block-syntax-toggling

### 2026-03-20 - #39: Cannot exit source mode when inline_source is only content
- **Status**: Open
- **Description**: When inline_source fills the entire paragraph, there's no clickable area outside the node to trigger LEAVE. Enter key doesn't exit source mode.
- **URL**: https://github.com/bhendo/skriv/issues/39
