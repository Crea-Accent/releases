<!-- @format -->

# Changelog — `clients/mobile`

## 1.2.1

### Patch Changes

- Synchronize CAFCA SQL & BOAPI SOAP integration, CreAI (Google Gemini) & MCP gateway (`mcp.crea-accent.app`, port 5004), fast NAS dossier indexing without synchronous N+1 SMB stalls, remote database `RegExp` query serialization, and unified `ServerDummi` host environment & NSSM service supervision.

## 1.2.0

### Minor Changes

- fixed issues

## 1.1.0

### Minor Changes

- fixed issues

## 1.0.0

### Major Changes

- Initial release of **Crea-Accent Studio Mobile** (`clients/mobile`) for **Android** and **iOS** using React Native.
- Added native **Vandaag (Schedule, Tasks, Calls & Werkbonnen)** screen, **Dossiers & Projects** explorer, **6-Digit / QR Device Pairing**, **Biometric Privacy Shield** (Face ID / Touch ID / Android Biometrics), and **Studio Workspace WebView** with the `window.creaMobile` bridge.
- Configured dedicated `.github/workflows/release-mobile.yml` (`mobile@*` tags) and `/secure/downloads/mobile` API endpoint so desktop and mobile releases are completely decoupled.
