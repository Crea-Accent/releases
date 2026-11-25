<!-- @format -->

# `packages/public` — Agent Guidelines (`AGENTS.md`)

`packages/public` is the canonical central repository for static branding assets (`favicon.svg`, `favicon.ico`, `logo.svg`, `logo.png`, `logo-dev.png`, `icon.png`, `icon-dev.png`, `banner.png`, `banner-dev.png`, `banner.svg`, `banner-dev.svg`) and crawler metadata (`sitemap.xml`) shared across all Next.js and Electron applications in **Crea-Accent Studio**.

---

## 🛠️ Key Responsibilities & Rules

1. **Source of Truth for Static Assets:** Do not add or edit shared logos, icons, banners, or `sitemap.xml` inside individual `apps/*/public` or `clients/desktop/public` folders directly—they will be overwritten.
2. **Syncing via `pnpm studio initialize`:** Whenever you add, rename, or update an asset inside `packages/public`, run `pnpm studio initialize` to propagate the updated files to every app's `public/` directory.
3. **Environment-Specific Branding:** Maintain environment-aware variants (`banner.svg`, `banner-dev.svg`, `icon.png`, `icon-dev.png`) used by `<Header />` and application favicons/manifests across `public` (`crea-accent.app`) and `dev` (`localhost:<port>`).
