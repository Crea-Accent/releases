<!-- @format -->

# Changelog

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
