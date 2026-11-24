# Publishing the landing page (GitHub Pages)

The landing page is `landing.html` (plus the images in `presskit/`). The workflow `.github/workflows/pages.yml` copies it to a small `_site` folder and deploys it to **https://rapttor.github.io/sparkbots/** whenever `landing.html`, `presskit/**` or the workflow itself changes on `master`.

## One-time setup

1. **The repository must be public**, or your GitHub account must have a paid plan (Pro, Team or Enterprise Cloud). GitHub Pages is not available for private repositories on the Free plan. This is the usual reason the setting is missing or the workflow fails.
2. In the repository: **Settings > Pages > Build and deployment > Source: "GitHub Actions"**. (Not "Deploy from a branch": the workflow does the deploying.)
3. Run the workflow once: **Actions > "Landing page" > Run workflow** (or push a change to `landing.html`).
4. After a minute the page is at https://rapttor.github.io/sparkbots/ and the workflow run shows the address.

## If the workflow fails

| Message in the run log | Cause and fix |
|---|---|
| `Get Pages site failed. Please verify that the repository has Pages enabled...` / `HttpError: Not Found` | Pages is not enabled yet (step 2), or the repository is private on a plan without Pages (step 1). |
| `Resource not accessible by integration` | Settings > Actions > General > Workflow permissions: allow read and write, then re-run. |
| The page shows the README instead of the landing page | Source is still "Deploy from a branch": switch it to "GitHub Actions". |
| The site is up but images are missing | The image is not under `presskit/screenshots/` or `presskit/artwork/` (the only folders copied), or it is a `.md` / `.mjs` file (removed on purpose). |

You can check the state from a terminal with the GitHub CLI: `gh api repos/rapttor/sparkbots/pages` (404 = not enabled) and `gh run list --workflow pages.yml`.

## Before making the repository public

- Look through the history and the files for anything personal: real session titles or messages in screenshots (blur them, as in `presskit/screenshots/watercooler-race.jpg`), personal paths, tokens. `backlog.md` is the owner's own idea file.
- The README and the release notes already say `git clone https://github.com/rapttor/sparkbots.git`; that only works for other people once the repository is public.
- Enable GitHub Sponsors first or leave `github:` commented in `.github/FUNDING.yml`.

## No Pages? Alternatives

`landing.html` is a single static page: it can be uploaded as `index.html` to any static host (for example rapttor.com), together with `presskit/screenshots/` and `presskit/artwork/`.
