---
name: polish-branch
description: Use when a feature branch is ready to wrap up, before creating a PR or merging. Triggers on phrases like "clean up the branch", "ready to merge", "polish before PR", or after the finishing-a-development-branch skill is invoked.
---

# Polish Branch

Clean up a feature branch before PR or merge: review code quality, then squash commits.

## Steps

### 1. Run /simplify

Invoke the `simplify` skill to review changed code for reuse, quality, and efficiency. Fix any issues found. Commit fixes if any.

### 2. Squash commits

Group the branch's commits into logical units. Typical grouping:

- **Design/docs** — specs, design docs, CLAUDE.md changes
- **Feature** — all implementation, tests, bug fixes, and refactors for the feature
- **Supporting changes** — skills, project config, settings that aren't part of the feature itself

Technique:
1. `git log --oneline <branch> ^main` to list all commits
2. Propose the grouping to the user for approval
3. Create a temp branch from main, cherry-pick each group's final tree state:
   ```
   git checkout -b squashed main
   git checkout <final-sha> -- <files for group>
   git commit -m "<message>"
   # repeat per group
   ```
4. Verify trees match: `diff <(git rev-parse <original>^{tree}) <(git rev-parse squashed^{tree})` — empty output means identical
5. Replace the branch: `git branch -M squashed <branch-name>` (this renames squashed, deleting the temp branch)
6. Force push with lease: `git push --force-with-lease origin <branch-name>`

Always confirm the grouping and force push with the user before executing.
