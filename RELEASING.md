# Releasing

Publishing is automated; you never run `npm publish` or create tags by hand.

## Steps

1. Merge your PRs to `main`. Main squash-merges, so each PR title must be a valid Conventional Commit.
2. Open a `chore: release X.Y.Z` PR that bumps the version with `npm version X.Y.Z --no-git-tag-version`, updates `VERSION` in `src/version.ts` to match (a unit test checks this), and turns `## [Unreleased]` in `CHANGELOG.md` into a `## [X.Y.Z] - YYYY-MM-DD` section (Breaking, Security, Added, Fixed, Changed, in plain language).
3. Merge it. `publish.yml` builds it (lint, format check, type-check, test, build), then waits. Open the run in **Actions** and approve the **npm-publish** deployment. Only then does it publish to npm with provenance and create the `vX.Y.Z` tag and GitHub Release.

## Choosing the version

| Change since the last release                   | Bump       |
| ----------------------------------------------- | ---------- |
| `feat!:` or a `BREAKING CHANGE:` footer         | major      |
| `feat:`                                         | minor      |
| `fix:` / `perf:`                                | patch      |
| only `chore:` `docs:` `refactor:` `test:` `ci:` | no release |

Before 1.0.0, breaking changes bump the minor version.

## After publishing

Check the registry directly (a local `npm view` can be stale):

```bash
curl -s https://registry.npmjs.org/@nombaoss%2Fnomba-node | node -e 'const d=JSON.parse(require("fs").readFileSync(0));const v=d["dist-tags"].latest;console.log(v,d.versions[v].dependencies??"no dependencies",d.versions[v].dist.attestations?"provenance":"NO provenance")'
```

Then confirm the tag and GitHub Release exist, and in an empty directory run `npm install @nombaoss/nomba-node` (expect 1 package, 0 vulnerabilities).

## One-time setup (repo owner)

- GitHub: create an environment named `npm-publish` with yourself as required reviewer, so a stolen login can't publish on its own.
- npm: on npmjs.com, add a Trusted Publisher for `@nombaoss/nomba-node` pointing at repo `NombaOSS/nomba-node`, workflow `publish.yml`, environment `npm-publish`. No npm token is stored anywhere. npm can only add a Trusted Publisher to a package that already exists, so the very first publish of a new package name is done once by hand (`npm publish --access public` from a clean checkout, logged in as an org owner with 2FA); every later release goes through the workflow.
