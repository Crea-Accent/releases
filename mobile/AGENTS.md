<!-- @format -->

# `clients/mobile` — Agent Guidelines (`AGENTS.md`)

## 🧭 Overview

`clients/mobile` (`Crea-Accent Studio Mobile`) is the native React Native / Expo mobile companion for **Android** and **iOS** (`app.creaaccent.studio.mobile`), featuring native Vandaag (Today) & Werkbonnen dashboards, Dossiers explorer, 6-digit QR device pairing, biometric Face ID / Touch ID / fingerprint Privacy Shield, push/local notifications, and a full `window.creaMobile` WebView bridge to `*.crea-accent.app`.

## 🏗️ Architecture & Files

- **`index.js` & `src/App.tsx`:** React Native entry point, SafeArea shell, deep-link router (`crea-accent://`), biometric background lock listener, and bottom-tab navigation (`home`, `dossiers`, `workspace`, `pairing`, `settings`).
- **`src/metadata.ts`:** Persistent mobile configuration (`AsyncStorage` + `metadata.json`), LAN/production URL resolution (`resolveMobileTargetUrl`, `resolveMobileApiBaseUrl`), and `crea-accent://` deep-link parser.
- **`src/updater.ts`:** Independent mobile release checker querying `/secure/downloads/mobile?channel=stable|canary` (`mobile@*` tags, `.apk` for Android, `.ipa` for iOS). Strictly ignores `desktop@*` releases so desktop and mobile updates remain 100% decoupled.
- **`src/bridge.ts`:** Injects `window.creaMobile` into the hosted Studio WebView and handles bidirectional native RPC (`notify`, `setBadgeCount`, `verifyBiometrics`, `writeClipboardText`, `haptic`, `share`, `openExternal`, `checkForUpdate`, `installUpdate`).
- **`src/notifications.ts`:** Native iOS (`UNUserNotificationCenter`) and Android notification channel dispatcher, badge count synchronizer, and daily 16:45 Werkbon reminder scheduler.
- **`src/biometrics.ts`:** Native iOS Face ID / Touch ID and Android BiometricPrompt verification (`expo-local-authentication`).
- **`src/screens/*`:**
    - `HomeScreen.tsx`: Native Vandaag schedule, tasks, calls, and Werkbonnen with 1-tap completion.
    - `DossiersScreen.tsx`: Native searchable Dossiers & Projects explorer.
    - `WorkspaceScreen.tsx`: Full-featured `react-native-webview` hosting `app.crea-accent.app` and `account.crea-accent.app` with native shortcut pill bar and pull-to-refresh.
    - `PairingScreen.tsx`: Native 6-character code & QR pairing against `/secure/auth/qr`.
    - `SettingsScreen.tsx`: Mobile preferences, LAN domain configuration, and independent Mobile Release Updater card.

## ⚠️ Important Rules & Gotchas

1. **Decoupled Release Workflows (`desktop@*` vs `mobile@*`):**
    - Desktop releases use `.github/workflows/release.yml`, tag prefix `desktop@*`, and `/secure/downloads/app`.
    - Mobile releases use `.github/workflows/release-mobile.yml`, tag prefix `mobile@*`, and `/secure/downloads/mobile`.
    - Never couple `desktop` and `mobile` in `.changeset/config.json` (`fixed` or `linked`), and never mark `mobile@*` GitHub releases with `--latest` so desktop `electron-updater` is never triggered by a mobile release.
2. **No Desktop Window Controls on Mobile:**
    - `window.creaMobile` sets `document.documentElement.classList.add('is-mobile-app')` (not `is-electron`), ensuring desktop minimize/maximize/close window controls never render on Android or iOS.
