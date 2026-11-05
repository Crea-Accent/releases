<!-- @format -->

<p align="center">
  <img src="https://www.crea-accent.app/banner.png" alt="Crea-Accent Mobile Banner" width="100%">
</p>

<p align="center">
  <b>Native React Native mobile companion for Android & iOS hosting Crea-Accent Studio with offline-ready Today/Werkbonnen views, biometric lock, and independent OTA/binary releases.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success?style=for-the-badge&logo=none" alt="Status">
  <img src="https://img.shields.io/badge/client-mobile%20(android%20%26%20ios)-a4b795?style=for-the-badge&logo=react" alt="Mobile Client">
</p>

---

## 🧭 Overview

**Crea-Accent Studio Mobile** (`clients/mobile`) is the cross-platform React Native (Android & iOS) mobile application for field engineers, project managers, and staff. It pairs native mobile screens for **Vandaag (Agenda & Werkbonnen)**, **Dossiers**, and **6-Digit QR Device Pairing** with a bridged **Studio Workspace** WebView (`window.creaMobile`).

---

## 🛠️ Core Features

- **Android & iOS Native Support:** Built with React Native & Expo Prebuild (`app.creaaccent.studio.mobile`) supporting phones and tablets (iPad / Android tablets).
- **Vandaag & Werkbonnen Field Dashboard:** Check off tasks, calls, and sign off daily Werkbonnen with 1 tap on-site.
- **Biometric Privacy Shield:** Native Face ID, Touch ID, and Android BiometricPrompt protection when returning from the background.
- **Instant 6-Digit & QR Device Pairing:** Pair with an active Desktop session or approve a waiting login via `/secure/auth/qr`.
- **Independent Release Pipeline (`mobile@*`):** Dedicated `.github/workflows/release-mobile.yml` and `/secure/downloads/mobile` endpoint so mobile updates never force a desktop update (and vice versa).

---

## 🚀 Commands

```bash
# Sync shared public icons/logos into clients/mobile/public
pnpm studio initialize

# Start Metro development server
pnpm --filter mobile dev

# Run on Android / iOS
pnpm --filter mobile android
pnpm --filter mobile ios

# Typecheck & verify build
pnpm --filter mobile build

# Package release artifacts (APK/AAB & IPA)
pnpm --filter mobile dist:android
pnpm --filter mobile dist:ios
```
