<!-- @format -->

# Changelog

## 0.4.4

### Patch Changes

- Add official Crea-Accent Outlook HTML signatures with inline CID image delivery, extract embedded predecessor messages on CC/forwarded mails, highlight unread mails with accent border, fix mail forward delivery and sidebar folder tree DnD, and refine planning event typography and side-by-side column alignment.

## 0.4.3

### Patch Changes

- Add the Admin Cameras tab (`?tab=cameras`), camera stream tunneling (`GET /cameras/:id/stream` & `/snapshot`, `PUT /cameras`), HTTP Basic/Digest upstream camera authentication, NextAuth JWE session & credential verification in `serviceServer.ts`, pre-seeded office cameras (`videofoon` & `appartement`), and silent desktop auto-updates.

## 0.4.2

### Patch Changes

- Lay out overlapping timed agenda events side-by-side in `AgendaGrid` and `AgendaMonthAndListViews`, and add a direct GitHub Releases API fallback to `desktop` and `VersionTracker` when `/core/downloads/app` is unreachable.

## 0.4.1

### Patch Changes

- Add 2-way Microsoft Outlook Categories sync across Planning and Mail with grouped category sections, large colored category banners, and custom category display names (keeping uncategorized incoming emails at the top), support crossing off completed Calls & Taken, ensure deadline-only tasks/calls sync as true all-day events in Outlook, widen Dossier/Project link selectors, and fix `apps/api` build + desktop updater fallbacks.

## 0.4.0

### Minor Changes

- fixed issues

### Patch Changes

- Include `pnpm-workspace.yaml` (`allowBuilds` for `electron` and `electron-winstaller`) when syncing desktop releases to `Crea-Accent/releases` so CI dependency installation succeeds and publishes release assets.

## 0.3.0

### Minor Changes

- fixed issues

### Patch Changes

- Include `pnpm-workspace.yaml` (`allowBuilds` for `electron` and `electron-winstaller`) when syncing desktop releases to `Crea-Accent/releases` so CI dependency installation succeeds and publishes release assets.

## 0.2.7

### Patch Changes

- Sync desktop release builds directly to public `Crea-Accent/releases` repository during `pnpm studio ship` so GitHub Actions builds on public runners with native `GITHUB_TOKEN` (no cross-repo PAT secret needed).

## 0.2.6

### Patch Changes

- Publish desktop installer assets per-OS immediately on completion, add workflow concurrency deduplication, and use macos-14 arm64 builds so macOS runner queues never stall or block Windows/Linux releases.

## 0.2.5

### Patch Changes

- Fix duplicate `--publish never` CLI flag in GitHub Actions desktop packaging workflow so `electron-builder` does not attempt to publish during the build step.

## 0.2.4

### Patch Changes

- Fix build error

## 0.2.3

### Patch Changes

- Changed update and download behavior

## 0.2.2

### Patch Changes

- Fix cross-subdomain production session cookies on Vercel, prevent login redirect loops, and fix `clients/desktop/release/*` artifact paths in GitHub Actions.

## 0.2.1

### Patch Changes

- Align GitHub Actions desktop release workflow, `/core/downloads/app` endpoint, desktop auto-updater, and download page with Xernerx Suite.

## 0.2.0

### Minor Changes

- d880337: Add Startpagina daily program view, two-way Outlook calendar & shared colleague calendar sync, custom Outlook category tags mapping, and interactive task queue drag-and-drop.

## 1.0.0

- Initial release of Crea-Accent Studio.
