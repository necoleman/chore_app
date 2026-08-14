# Deployment notes

One file per release that needs hand-deploying, kept alongside the code it
describes so the instructions can't drift from it or get lost in a message
thread.

**Why these exist:** the frontend deploys itself — pushing to `main` rebuilds and
publishes it via GitHub Actions. The Apps Script backend does not. Nothing
connects GitHub to the script bound to the spreadsheet, so those files have to be
pasted in by hand and a new deployment version cut before any backend change goes
live. These notes say which files changed, what else has to happen (re-running
`setup()` for trigger changes, new spreadsheet columns, one-off repair runs), and
what to expect afterwards.

Read the note matching the branch being merged. Older ones are kept as a record
of what each release required.
