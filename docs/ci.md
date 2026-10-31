# Continuous integration and delivery

## What runs

Every push to `main` and every pull request runs `.github/workflows/ci.yml`:

1. `verify` runs formatting, typecheck and the full test suite against real Postgres 17 and Redis 7 service containers, then builds the web app (enforcing the bundle budget and the no-inline-script rule) and bundles the API and worker.
2. `audit` runs `npm audit` on production dependencies and fails on high severity findings.
3. `stack` builds the four Docker images with layer caching, scans them with Trivy (fixed HIGH and CRITICAL findings fail the run), starts the whole stack with Docker Compose and runs the end-to-end smoke test.
4. `publish` pushes the images to GitHub Container Registry, tagged with the commit SHA and `latest`. It only runs on `main` and only after the three jobs above passed.

CodeQL runs separately on pushes, pull requests and weekly. Dependabot proposes npm, Docker and GitHub Actions updates weekly.

## Decisions

- The workflow token is read only by default. Only the publish job can write packages, and it uses the built-in `GITHUB_TOKEN`, so no credentials are stored.
- Third-party actions are pinned to major versions. Pinning to commit SHAs is stricter and is the next hardening step.
- Images are tagged with the commit SHA for deployment. `latest` exists for convenience only.

## Known limits

- The published web image has its API address baked in at build time (`VITE_API_URL` repository variable). Each environment needs its own web build, or the app needs a runtime config file.
- The Trivy scan covers operating system and library packages in the images, not application logic. CodeQL covers some of that.
- There is no deployment job yet. The cloud design document describes where it would go.
