/** @format */

import { BrowserWindow, app, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type DesktopUpdateStatus = 'checking' | 'waiting-for-assets' | 'downloading' | 'ready' | 'installing' | 'up-to-date' | 'error';

export interface DesktopUpdateCheckResult {
	outdated: boolean;
	currentVersion: string;
	latestVersion: string | null;
	tagName: string | null;
	publishedAt: string | null;
	channel: 'stable' | 'canary';
	downloadUrl: string | null;
	fileName: string | null;
	size: number | null;
	downloaded: boolean;
	downloading: boolean;
	progress: number;
	status: DesktopUpdateStatus;
}

export interface DesktopUpdateProgress {
	status: DesktopUpdateStatus;
	progress: number;
	downloadedBytes?: number;
	totalBytes?: number;
	version?: string | null;
	message?: string;
	error?: string;
	downloaded?: boolean;
}

export interface UpdaterContext {
	getWin: () => BrowserWindow | undefined;
	sendStatus: (message: string) => void;
	sendError: (message: string) => void;
	log: (message: string) => void;
	prepareQuit: () => void;
}

const MIN_VALID_BINARY_BYTES = 1024 * 1024; // 1 MB sanity threshold
const NORMAL_POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const ASSET_WAIT_POLL_INTERVAL_MS = 60 * 1000; // 60 seconds when tag exists but CI is still uploading binaries

let cachedUpdateInfo: DesktopUpdateCheckResult | null = null;
let activeStagePromise: Promise<string | null> | null = null;
let activeInstallPromise: Promise<boolean> | null = null;
let backgroundPollTimer: ReturnType<typeof setTimeout> | null = null;
let showForegroundTaskbarProgress = false;

function cleanVersionString(raw: string | null | undefined): string {
	if (!raw) return '';
	return raw
		.trim()
		.replace(/^Desktop\s+/i, '')
		.replace(/^desktop@/i, '')
		.replace(/^v/i, '');
}

export function isRemoteVersionNewer(currentRaw: string, remoteRaw: string | null | undefined): boolean {
	const current = cleanVersionString(currentRaw);
	const remote = cleanVersionString(remoteRaw);
	if (!current || !remote || current === remote) return false;

	const [currentBase, currentPre = ''] = current.split('-', 2);
	const [remoteBase, remotePre = ''] = remote.split('-', 2);

	const currentParts = currentBase.split('.').map((n) => parseInt(n, 10) || 0);
	const remoteParts = remoteBase.split('.').map((n) => parseInt(n, 10) || 0);

	const maxLen = Math.max(currentParts.length, remoteParts.length, 3);
	for (let i = 0; i < maxLen; i++) {
		const c = currentParts[i] ?? 0;
		const r = remoteParts[i] ?? 0;
		if (r > c) return true;
		if (r < c) return false;
	}

	if (currentPre && !remotePre) return true;
	if (!currentPre && remotePre) return false;

	if (currentPre && remotePre && currentPre !== remotePre) {
		if (/^canary\.[a-f0-9]{5,}$/i.test(remotePre)) {
			return true;
		}
	}

	return false;
}

function getCandidateApiBases(channel: 'stable' | 'canary'): string[] {
	const domain = process.env.NEXT_PUBLIC_DOMAIN || process.env.DOMAIN || '';
	const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(domain);
	const candidates: string[] = [];

	if (!app.isPackaged) {
		if (domain && !isIp && domain !== 'localhost' && domain !== '127.0.0.1' && domain !== 'crea-accent.app') {
			candidates.push(`https://account.${domain}`);
			candidates.push(`https://api.${domain}`);
		} else {
			candidates.push(`http://${domain && isIp ? domain : '127.0.0.1'}:4003`);
			candidates.push(`http://${domain && isIp ? domain : '127.0.0.1'}:4001`);
		}
	}

	if (channel === 'canary') {
		candidates.push('https://account.crea-accent.app');
		candidates.push('https://api.crea-accent.app');
		candidates.push('https://crea-accent.app');
	}
	candidates.push('https://account.crea-accent.app');
	candidates.push('https://api.crea-accent.app');
	candidates.push('https://crea-accent.app');

	return Array.from(new Set(candidates));
}

function resolveStagedInstallerPath(info: { fileName?: string | null; latestVersion?: string | null }): string {
	const ext = process.platform === 'win32' ? 'exe' : process.platform === 'darwin' ? 'dmg' : 'AppImage';
	const safeFileName = (info.fileName || `Crea-Accent-Studio-${info.latestVersion || 'latest'}-setup.${ext}`).replace(/[^a-zA-Z0-9._ -]/g, '_');
	return path.join(app.getPath('temp'), safeFileName);
}

function isStagedBinaryValid(filePath: string, expectedSize?: number | null): boolean {
	try {
		if (!fs.existsSync(filePath)) return false;
		const stat = fs.statSync(filePath);
		if (!stat.isFile() || stat.size < MIN_VALID_BINARY_BYTES) return false;
		if (typeof expectedSize === 'number' && expectedSize > 0 && stat.size !== expectedSize) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

function cleanupOldStagedInstallers(currentVersion: string, keepFilePath?: string) {
	try {
		const tempDir = app.getPath('temp');
		const entries = fs.readdirSync(tempDir);
		for (const entry of entries) {
			if (!/^Crea-Accent[\s._-]*Studio-.*-setup\.(?:exe|dmg|AppImage)(?:\.part)?$/i.test(entry)) continue;
			const fullPath = path.join(tempDir, entry);
			if (keepFilePath && path.resolve(fullPath) === path.resolve(keepFilePath)) continue;
			const match = entry.match(/^Crea-Accent[\s._-]*Studio-(.+?)-setup\./i);
			const fileVer = match?.[1] ? cleanVersionString(match[1]) : '';
			if (entry.endsWith('.part') || !fileVer || fileVer === currentVersion || !isRemoteVersionNewer(currentVersion, fileVer)) {
				try {
					fs.unlinkSync(fullPath);
				} catch {}
			}
		}
	} catch {}
}

function broadcastUpdateProgress(ctx: UpdaterContext, payload: DesktopUpdateProgress, updateStatusText = false) {
	if (updateStatusText && payload.message) {
		ctx.sendStatus(payload.message);
	}
	for (const bw of BrowserWindow.getAllWindows()) {
		if (!bw || bw.isDestroyed()) continue;
		try {
			bw.webContents.send('update:progress', payload);
		} catch {}
	}
	const win = ctx.getWin();
	if (win && !win.isDestroyed()) {
		try {
			if (payload.status === 'downloading' && showForegroundTaskbarProgress) {
				win.setProgressBar(Math.max(0.02, Math.min(0.99, (payload.progress || 1) / 100)));
			} else if (payload.status === 'installing') {
				win.setProgressBar(1, { mode: 'indeterminate' });
			} else if (payload.status === 'error' && showForegroundTaskbarProgress) {
				win.setProgressBar(1, { mode: 'error' });
				setTimeout(() => {
					if (!win.isDestroyed()) win.setProgressBar(-1);
				}, 3000);
			} else if (payload.status === 'up-to-date' || payload.status === 'ready') {
				win.setProgressBar(-1);
			}
		} catch {}
	}
}

function buildCheckResult(
	currentVersion: string,
	channel: 'stable' | 'canary',
	rawVersion: string | null | undefined,
	tagName: string | null | undefined,
	publishedAt: string | null | undefined,
	asset: { name?: string; url?: string; browser_download_url?: string; size?: number } | null | undefined
): DesktopUpdateCheckResult {
	const resolvedDownloadUrl = asset?.url || asset?.browser_download_url || null;
	let latestVersion = cleanVersionString(rawVersion);
	if (!latestVersion && asset?.name) {
		const match = String(asset.name).match(/Crea-Accent[\s._-]*Studio-(.+?)-setup\.(?:exe|dmg|AppImage)$/i);
		if (match?.[1]) latestVersion = cleanVersionString(match[1]);
	}
	if (!latestVersion && tagName && tagName !== 'canary') {
		latestVersion = cleanVersionString(tagName);
	}

	const outdated = isRemoteVersionNewer(currentVersion, latestVersion);
	const expectedSize = typeof asset?.size === 'number' ? asset.size : null;
	const stagedPath = resolveStagedInstallerPath({ fileName: asset?.name || null, latestVersion: latestVersion || null });
	const alreadyDownloaded = outdated && Boolean(resolvedDownloadUrl) && isStagedBinaryValid(stagedPath, expectedSize);
	const isDownloadingNow = Boolean(activeStagePromise) && !alreadyDownloaded;

	const status: DesktopUpdateStatus = !outdated ? 'up-to-date' : alreadyDownloaded ? 'ready' : !resolvedDownloadUrl ? 'waiting-for-assets' : isDownloadingNow ? 'downloading' : 'checking';

	return {
		outdated,
		currentVersion,
		latestVersion: latestVersion || null,
		tagName: tagName || null,
		publishedAt: publishedAt || null,
		channel,
		downloadUrl: resolvedDownloadUrl,
		fileName: asset?.name || null,
		size: expectedSize,
		downloaded: alreadyDownloaded,
		downloading: isDownloadingNow,
		progress: alreadyDownloaded ? 100 : cachedUpdateInfo?.progress || 0,
		status,
	};
}

export async function checkDesktopRelease(log?: (msg: string) => void): Promise<DesktopUpdateCheckResult> {
	const currentVersion = cleanVersionString(app.getVersion());
	const channel: 'stable' | 'canary' = currentVersion.includes('canary') ? 'canary' : 'stable';
	const bases = getCandidateApiBases(channel);

	for (const base of bases) {
		for (const routePrefix of ['/core/downloads/app', '/secure/downloads/app']) {
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 8000);
				const res = await fetch(`${base}${routePrefix}?channel=${channel}`, {
					signal: controller.signal,
					headers: {
						Accept: 'application/json',
					},
				});
				clearTimeout(timeout);

				if (!res.ok) continue;

				const data = (await res.json()) as {
					version?: string | null;
					tagName?: string | null;
					publishedAt?: string | null;
					windows?: { name: string; url?: string; browser_download_url?: string; size?: number } | null;
					macos?: { name: string; url?: string; browser_download_url?: string; size?: number } | null;
					linux?: { name: string; url?: string; browser_download_url?: string; size?: number } | null;
				};

				const asset = process.platform === 'win32' ? data.windows : process.platform === 'darwin' ? data.macos : data.linux;
				const result = buildCheckResult(currentVersion, channel, data.version, data.tagName, data.publishedAt, asset);

				cachedUpdateInfo = result;
				log?.(
					`UPDATE CHECK (${base}${routePrefix}): current=${currentVersion} latest=${result.latestVersion || 'unknown'} outdated=${result.outdated} assetReady=${Boolean(result.downloadUrl)} staged=${result.downloaded}`
				);
				return result;
			} catch (err) {
				log?.(`UPDATE CHECK FAILED (${base}${routePrefix}): ${(err as Error).message}`);
			}
		}
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		const ghRes = await fetch('https://api.github.com/repos/Crea-Accent/releases/releases?per_page=20', {
			signal: controller.signal,
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'Crea-Accent-Studio-Desktop',
			},
		});
		clearTimeout(timeout);

		if (ghRes.ok) {
			const releases = (await ghRes.json()) as any[];
			const desktopReleases = Array.isArray(releases)
				? releases.filter((r) => !r.draft && (r.tag_name === 'canary' || /^desktop@/i.test(r.tag_name) || /^v?\d+\.\d+\.\d+/i.test(r.tag_name)))
				: [];
			const targetRelease =
				channel === 'canary'
					? desktopReleases.find((r) => r.tag_name === 'canary' || r.prerelease || String(r.tag_name).includes('canary'))
					: desktopReleases.find((r) => !r.prerelease && r.tag_name !== 'canary' && !String(r.tag_name).includes('canary'));

			if (targetRelease && Array.isArray(targetRelease.assets)) {
				const ext = process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.dmg' : '.appimage';
				const asset = targetRelease.assets.find((a: any) =>
					String(a.name || '')
						.toLowerCase()
						.endsWith(ext)
				);
				const result = buildCheckResult(
					currentVersion,
					channel,
					targetRelease.tag_name !== 'canary' ? targetRelease.tag_name : targetRelease.name,
					targetRelease.tag_name,
					targetRelease.published_at,
					asset
				);
				cachedUpdateInfo = result;
				log?.(`UPDATE CHECK (github fallback): current=${currentVersion} latest=${result.latestVersion || 'unknown'} outdated=${result.outdated} staged=${result.downloaded}`);
				return result;
			}
		}
	} catch (err) {
		log?.(`UPDATE CHECK FAILED (github fallback): ${(err as Error).message}`);
	}

	return (
		cachedUpdateInfo || {
			outdated: false,
			currentVersion,
			latestVersion: null,
			tagName: null,
			publishedAt: null,
			channel,
			downloadUrl: null,
			fileName: null,
			size: null,
			downloaded: false,
			downloading: false,
			progress: 0,
			status: 'up-to-date',
		}
	);
}

/**
 * Downloads the update installer to a `.part` temporary file, verifies its integrity/byte count,
 * and atomically renames it to the final staged installer path.
 */
export async function stageUpdateBinary(ctx: UpdaterContext, targetInfo?: DesktopUpdateCheckResult, options?: { showSplashStatus?: boolean; foreground?: boolean }): Promise<string | null> {
	if (options?.foreground) {
		showForegroundTaskbarProgress = true;
	}
	if (activeStagePromise) return activeStagePromise;

	activeStagePromise = (async () => {
		const showStatus = Boolean(options?.showSplashStatus);
		try {
			const info = targetInfo?.downloadUrl ? targetInfo : await checkDesktopRelease(ctx.log);
			if (!info.outdated || !info.downloadUrl) {
				return null;
			}

			const tempPath = resolveStagedInstallerPath(info);
			if (isStagedBinaryValid(tempPath, info.size)) {
				cachedUpdateInfo = {
					...info,
					downloaded: true,
					downloading: false,
					progress: 100,
					status: 'ready',
				};
				broadcastUpdateProgress(
					ctx,
					{
						status: 'ready',
						progress: 100,
						downloaded: true,
						version: info.latestVersion,
						message: `Update v${info.latestVersion || 'latest'} ready to install`,
					},
					showStatus
				);
				return tempPath;
			}

			const partPath = `${tempPath}.part`;
			try {
				if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
			} catch {}

			cachedUpdateInfo = {
				...info,
				downloaded: false,
				downloading: true,
				progress: 1,
				status: 'downloading',
			};

			broadcastUpdateProgress(
				ctx,
				{
					status: 'downloading',
					progress: 1,
					downloaded: false,
					version: info.latestVersion,
					message: `Downloading update ${info.latestVersion ? `v${info.latestVersion} ` : ''}(1%)…`,
				},
				showStatus
			);

			const res = await fetch(info.downloadUrl);
			if (!res.ok || !res.body) {
				throw new Error(`Download failed with HTTP ${res.status}`);
			}

			const totalBytes = Number(res.headers.get('content-length')) || info.size || 0;
			let downloadedBytes = 0;
			let lastReportedPercent = 1;

			const fileStream = fs.createWriteStream(partPath);
			const reader = res.body.getReader();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					downloadedBytes += value.byteLength;
					fileStream.write(Buffer.from(value));
					if (totalBytes > 0) {
						const pct = Math.min(99, Math.max(1, Math.round((downloadedBytes / totalBytes) * 100)));
						if (pct !== lastReportedPercent) {
							lastReportedPercent = pct;
							if (cachedUpdateInfo) cachedUpdateInfo.progress = pct;
							broadcastUpdateProgress(
								ctx,
								{
									status: 'downloading',
									progress: pct,
									downloadedBytes,
									totalBytes,
									downloaded: false,
									version: info.latestVersion,
									message: `Downloading update ${info.latestVersion ? `v${info.latestVersion} ` : ''}(${pct}%)…`,
								},
								showStatus
							);
						}
					}
				}
			}

			await new Promise<void>((resolve, reject) => {
				fileStream.end(() => resolve());
				fileStream.on('error', reject);
			});

			if (downloadedBytes < MIN_VALID_BINARY_BYTES || (totalBytes > 0 && downloadedBytes !== totalBytes)) {
				try {
					fs.unlinkSync(partPath);
				} catch {}
				throw new Error(`Incomplete download (${downloadedBytes} of ${totalBytes} bytes)`);
			}

			try {
				if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
			} catch {}
			fs.renameSync(partPath, tempPath);

			cleanupOldStagedInstallers(info.currentVersion, tempPath);

			cachedUpdateInfo = {
				...info,
				downloaded: true,
				downloading: false,
				progress: 100,
				status: 'ready',
			};

			ctx.log(`UPDATE STAGED READY: ${tempPath} (${downloadedBytes} bytes)`);
			broadcastUpdateProgress(
				ctx,
				{
					status: 'ready',
					progress: 100,
					downloadedBytes,
					totalBytes: totalBytes || downloadedBytes,
					downloaded: true,
					version: info.latestVersion,
					message: `Update v${info.latestVersion || 'latest'} ready to install`,
				},
				showStatus
			);

			return tempPath;
		} catch (error) {
			const message = (error as Error).message || 'Failed to download update';
			ctx.log(`UPDATE STAGE WARNING: ${message}`);
			if (cachedUpdateInfo) {
				cachedUpdateInfo.downloading = false;
				cachedUpdateInfo.status = 'error';
			}
			if (options?.foreground) {
				ctx.sendError(message);
				broadcastUpdateProgress(
					ctx,
					{
						status: 'error',
						progress: 0,
						error: message,
					},
					showStatus
				);
			}
			return null;
		} finally {
			activeStagePromise = null;
			showForegroundTaskbarProgress = false;
		}
	})();

	return activeStagePromise;
}

/**
 * Silently installs a verified staged update binary and relaunches the application without wizard prompts.
 */
export async function applyStagedUpdate(ctx: UpdaterContext, stagedPath: string, version?: string | null): Promise<boolean> {
	if (!fs.existsSync(stagedPath)) return false;

	broadcastUpdateProgress(
		ctx,
		{
			status: 'installing',
			progress: 100,
			downloaded: true,
			version: version || cachedUpdateInfo?.latestVersion || null,
			message: `Installing update ${version ? `v${version} ` : ''}& restarting…`,
		},
		true
	);

	ctx.log(`APPLYING STAGED UPDATE: ${stagedPath}`);
	ctx.prepareQuit();

	await new Promise((r) => setTimeout(r, 400));

	if (process.platform === 'win32') {
		const cmdLine = 'timeout /t 1 /nobreak >nul & start "" /wait "%CREA_INSTALLER%" /S --updated & start "" "%CREA_APP_EXE%" --relaunch --updated';
		const child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
			env: {
				...process.env,
				CREA_INSTALLER: stagedPath,
				CREA_APP_EXE: process.execPath,
			},
		});
		child.unref();
		app.exit(0);
		return true;
	}

	if (process.platform === 'linux') {
		try {
			fs.chmodSync(stagedPath, 0o755);
		} catch {}

		const currentAppImage = process.env.APPIMAGE;
		if (currentAppImage) {
			try {
				fs.copyFileSync(stagedPath, currentAppImage);
				fs.chmodSync(currentAppImage, 0o755);
				try {
					fs.unlinkSync(stagedPath);
				} catch {}
				const child = spawn(currentAppImage, ['--relaunch', '--updated'], {
					detached: true,
					stdio: 'ignore',
				});
				child.unref();
				app.exit(0);
				return true;
			} catch (err) {
				ctx.log(`LINUX APPIMAGE REPLACE FALLBACK: ${(err as Error).message}`);
			}
		}

		const child = spawn(stagedPath, ['--relaunch', '--updated'], {
			detached: true,
			stdio: 'ignore',
		});
		child.unref();
		app.exit(0);
		return true;
	}

	if (process.platform === 'darwin') {
		const mountPoint = `/Volumes/CreaAccentUpdate-${Date.now()}`;
		const script = [
			'sleep 1',
			`if hdiutil attach "$CREA_INSTALLER" -nobrowse -quiet -mountpoint "${mountPoint}"; then`,
			`  APP_BUNDLE=$(find "${mountPoint}" -maxdepth 1 -name "*.app" | head -n 1)`,
			'  if [ -n "$APP_BUNDLE" ] && rm -rf "/Applications/Crea-Accent Studio.app" && ditto "$APP_BUNDLE" "/Applications/Crea-Accent Studio.app"; then',
			`    hdiutil detach "${mountPoint}" -quiet || true`,
			'    rm -f "$CREA_INSTALLER" || true',
			'    open -a "/Applications/Crea-Accent Studio.app" --args --relaunch --updated',
			'    exit 0',
			'  fi',
			`  hdiutil detach "${mountPoint}" -quiet || true`,
			'fi',
			'open "$CREA_INSTALLER"',
		].join('\n');

		const child = spawn('sh', ['-c', script], {
			detached: true,
			stdio: 'ignore',
			env: {
				...process.env,
				CREA_INSTALLER: stagedPath,
			},
		});
		child.unref();
		app.exit(0);
		return true;
	}

	await shell.openPath(stagedPath);
	app.exit(0);
	return true;
}

export function hasStagedUpdate(): { ready: boolean; path: string | null; version: string | null } {
	if (!cachedUpdateInfo?.outdated) {
		return { ready: false, path: null, version: null };
	}
	const stagedPath = resolveStagedInstallerPath(cachedUpdateInfo);
	if (isStagedBinaryValid(stagedPath, cachedUpdateInfo.size)) {
		return { ready: true, path: stagedPath, version: cachedUpdateInfo.latestVersion };
	}
	return { ready: false, path: null, version: null };
}

export async function downloadAndInstallUpdate(ctx: UpdaterContext, targetInfo?: DesktopUpdateCheckResult): Promise<boolean> {
	if (activeInstallPromise) return activeInstallPromise;

	activeInstallPromise = (async () => {
		try {
			const info = targetInfo?.downloadUrl ? targetInfo : await checkDesktopRelease(ctx.log);
			if (!info.downloadUrl) {
				broadcastUpdateProgress(ctx, {
					status: 'error',
					progress: 0,
					error: 'No installer package found for your operating system.',
				});
				return false;
			}

			const stagedPath = await stageUpdateBinary(ctx, info, { foreground: true, showSplashStatus: true });
			if (!stagedPath) {
				return false;
			}

			return await applyStagedUpdate(ctx, stagedPath, info.latestVersion);
		} catch (error) {
			const message = (error as Error).message || 'Failed to install update';
			ctx.sendError(message);
			broadcastUpdateProgress(ctx, {
				status: 'error',
				progress: 0,
				error: message,
			});
			return false;
		} finally {
			activeInstallPromise = null;
		}
	})();

	return activeInstallPromise;
}

export function startBackgroundUpdatePoller(ctx: UpdaterContext) {
	if (backgroundPollTimer) {
		clearTimeout(backgroundPollTimer);
		backgroundPollTimer = null;
	}

	const runCycle = async () => {
		let nextDelay = NORMAL_POLL_INTERVAL_MS;
		try {
			const info = await checkDesktopRelease(ctx.log);
			if (info.outdated) {
				if (!info.downloadUrl) {
					ctx.log(`UPDATE POLLER: Tag ${info.tagName || info.latestVersion} detected, waiting for OS binary asset...`);
					nextDelay = ASSET_WAIT_POLL_INTERVAL_MS;
				} else if (!info.downloaded) {
					const staged = await stageUpdateBinary(ctx, info, { foreground: false, showSplashStatus: false });
					if (!staged) {
						nextDelay = ASSET_WAIT_POLL_INTERVAL_MS;
					}
				} else {
					broadcastUpdateProgress(ctx, {
						status: 'ready',
						progress: 100,
						downloaded: true,
						version: info.latestVersion,
					});
				}
			}
		} catch (err) {
			ctx.log(`BACKGROUND UPDATE POLL ERROR: ${(err as Error).message}`);
		} finally {
			backgroundPollTimer = setTimeout(runCycle, nextDelay);
		}
	};

	backgroundPollTimer = setTimeout(runCycle, 4000);
}

/**
 * Discord-style startup updater:
 * Runs while the splash screen (`loading.html`) is visible.
 * - Cleans up old staged installers if we just booted into an updated version.
 * - If a newer release has a ready binary asset (or was already pre-downloaded in a previous session),
 *   downloads/stages it on the splash screen and applies the silent update before opening the main window.
 * - Returns `true` if an update installation was triggered (meaning the current process is exiting).
 */
export async function runStartupUpdater(ctx: UpdaterContext, isDebug: boolean): Promise<boolean> {
	const currentVersion = cleanVersionString(app.getVersion());
	cleanupOldStagedInstallers(currentVersion);

	if (isDebug || !app.isPackaged) {
		startBackgroundUpdatePoller(ctx);
		return false;
	}

	if (process.argv.includes('--updated')) {
		startBackgroundUpdatePoller(ctx);
		return false;
	}

	try {
		const info = await checkDesktopRelease(ctx.log);
		if (info.outdated && info.downloadUrl) {
			ctx.log(`STARTUP UPDATE AVAILABLE: v${currentVersion} -> v${info.latestVersion}`);
			const stagedPath = await stageUpdateBinary(ctx, info, { foreground: false, showSplashStatus: true });
			if (stagedPath) {
				const applied = await applyStagedUpdate(ctx, stagedPath, info.latestVersion);
				if (applied) return true;
			}
		}
	} catch (error) {
		ctx.log(`STARTUP UPDATE CHECK INFO: ${(error as Error).message}`);
	}

	startBackgroundUpdatePoller(ctx);
	return false;
}
