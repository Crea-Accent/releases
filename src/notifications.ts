/** @format */

import { BrowserWindow, Notification, Tray, app, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { loadEnvDomain, resolveDesktopTargetUrl, type Metadata } from './metadata.js';
import { createWindowsBadgeOverlay } from './desktopExtras.js';

export const APP_USER_MODEL_ID = app.isPackaged ? 'CreaAccent.Studio.Desktop' : 'CreaAccent.Studio.Desktop.Dev';

export interface DesktopNotificationPayload {
	id?: string;
	title: string;
	body?: string;
	subtitle?: string;
	link?: string | null;
	silent?: boolean;
	urgency?: 'normal' | 'critical' | 'low';
	force?: boolean;
}

export function resolveOsIconPath(iconPath?: string): string {
	if (app.isPackaged) {
		try {
			const extraIco = path.join(process.resourcesPath, 'icon.ico');
			const unpackedIco = iconPath ? iconPath.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1') : '';
			const sourceIco = fs.existsSync(extraIco) ? extraIco : unpackedIco && !/app\.asar[\\/]/i.test(unpackedIco) && fs.existsSync(unpackedIco) ? unpackedIco : '';

			if (sourceIco) {
				try {
					const userDataDir = app.getPath('userData');
					const stagedIco = path.join(userDataDir, 'icon.ico');
					const srcStat = fs.statSync(sourceIco);
					const dstStat = fs.existsSync(stagedIco) ? fs.statSync(stagedIco) : null;
					if (!dstStat || dstStat.size !== srcStat.size) {
						fs.mkdirSync(userDataDir, { recursive: true });
						fs.copyFileSync(sourceIco, stagedIco);
					}
					if (fs.existsSync(stagedIco)) {
						return path.resolve(stagedIco);
					}
				} catch {}
				return path.resolve(sourceIco);
			}
		} catch {}
		return process.execPath;
	}
	if (iconPath && !/app\.asar[\\/]/i.test(iconPath)) {
		const dir = path.dirname(iconPath);
		const devIco = path.join(dir, 'icon-dev.ico');
		if (fs.existsSync(devIco)) {
			return path.resolve(devIco);
		}
		if (fs.existsSync(iconPath)) {
			return path.resolve(iconPath);
		}
	}
	return process.execPath;
}

export function resolveWindowIconImage(iconPath: string) {
	if (app.isPackaged) {
		try {
			const extraIco = path.join(process.resourcesPath, 'icon.ico');
			if (fs.existsSync(extraIco)) {
				const extraImg = nativeImage.createFromPath(extraIco);
				if (!extraImg.isEmpty()) return extraImg;
			}
			if (iconPath) {
				const unpacked = iconPath.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
				if (!/app\.asar[\\/]/i.test(unpacked) && fs.existsSync(unpacked)) {
					const unpackedImg = nativeImage.createFromPath(unpacked);
					if (!unpackedImg.isEmpty()) return unpackedImg;
				}
			}
		} catch {}
	}
	const dir = iconPath ? path.dirname(iconPath) : '';
	if (!app.isPackaged && dir) {
		const devIco = path.join(dir, 'icon-dev.ico');
		if (fs.existsSync(devIco)) {
			const devIcoImg = nativeImage.createFromPath(devIco);
			if (!devIcoImg.isEmpty()) return devIcoImg;
		}
		const devPng = path.join(dir, 'icon-dev.png');
		if (fs.existsSync(devPng)) {
			const devPngImg = nativeImage.createFromPath(devPng);
			if (!devPngImg.isEmpty()) return devPngImg;
		}
	}
	const pngPath = dir ? path.join(dir, 'icon.png') : '';
	if (iconPath && fs.existsSync(iconPath)) {
		const icoImg = nativeImage.createFromPath(iconPath);
		if (!icoImg.isEmpty()) return icoImg;
	}
	if (pngPath && fs.existsSync(pngPath)) {
		const pngImg = nativeImage.createFromPath(pngPath);
		if (!pngImg.isEmpty()) return pngImg;
	}
	return nativeImage.createEmpty();
}

export function applyWindowAppDetails(targetWin: BrowserWindow, iconPath: string) {
	if (process.platform !== 'win32' || !targetWin || targetWin.isDestroyed()) return;
	try {
		const appIcon = resolveWindowIconImage(iconPath);
		if (!appIcon.isEmpty()) {
			targetWin.setIcon(appIcon);
		}
	} catch {}
}

export function configureAppNotificationIdentity(iconPath?: string, appRootPath?: string) {
	try {
		app.setName('Crea-Accent Studio');
		if (process.platform === 'win32') {
			app.setAppUserModelId(APP_USER_MODEL_ID);
			const osIconPath = resolveOsIconPath(iconPath);
			const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
			const shortcutName = app.isPackaged ? 'Crea-Accent Studio.lnk' : 'Crea-Accent Studio (Dev).lnk';
			const shortcutPath = path.join(startMenuDir, shortcutName);
			const targetArgs = app.isPackaged ? '' : appRootPath || process.cwd();
			const shortcutDetails = {
				target: process.execPath,
				args: targetArgs,
				cwd: app.isPackaged ? path.dirname(process.execPath) : targetArgs,
				description: app.isPackaged ? 'Crea-Accent Studio' : 'Crea-Accent Studio (Dev)',
				icon: osIconPath,
				iconIndex: 0,
				appUserModelId: APP_USER_MODEL_ID,
			};
			try {
				if (fs.existsSync(shortcutPath)) {
					fs.chmodSync(shortcutPath, 0o666);
				}
			} catch {}
			if (!shell.writeShortcutLink(shortcutPath, 'replace', shortcutDetails)) {
				shell.writeShortcutLink(shortcutPath, 'create', shortcutDetails);
			}

			if (!app.isPackaged) {
				const prodShortcutPath = path.join(startMenuDir, 'Crea-Accent Studio.lnk');
				if (fs.existsSync(prodShortcutPath)) {
					try {
						const existingProd = shell.readShortcutLink(prodShortcutPath);
						if (/electron\.exe$/i.test(existingProd.target || '') || /app\.asar/i.test(existingProd.icon || '')) {
							const installedExe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Crea-Accent Studio', 'Crea-Accent Studio.exe');
							if (fs.existsSync(installedExe)) {
								const stagedProdIcon = path.join(app.getPath('userData'), 'icon.ico');
								const prodIcon = fs.existsSync(stagedProdIcon) ? stagedProdIcon : installedExe;
								fs.chmodSync(prodShortcutPath, 0o666);
								shell.writeShortcutLink(prodShortcutPath, 'replace', {
									target: installedExe,
									args: '',
									cwd: path.dirname(installedExe),
									description: 'Crea-Accent Studio',
									icon: prodIcon,
									iconIndex: 0,
									appUserModelId: 'CreaAccent.Studio.Desktop',
								});
							} else {
								fs.unlinkSync(prodShortcutPath);
							}
						}
					} catch {}
				}
				const electronShortcutPath = path.join(startMenuDir, 'Electron.lnk');
				if (fs.existsSync(electronShortcutPath)) {
					try {
						fs.unlinkSync(electronShortcutPath);
					} catch {}
				}
			}
		}
	} catch {}
}

export function dispatchNativeNotification(
	payload: DesktopNotificationPayload,
	ctx: {
		getWin: () => BrowserWindow | undefined;
		getTray: () => Tray | null;
		getMeta: () => Metadata;
		webUrl: string;
		iconPath: string;
		log: (msg: string) => void;
	}
): boolean {
	try {
		if (!payload?.title) return false;

		const currentMeta = ctx.getMeta();
		if (!payload.force && currentMeta.desktopNotifications === false) {
			return false;
		}

		const win = ctx.getWin();
		const tray = ctx.getTray();
		const isMac = process.platform === 'darwin';
		const isWin = process.platform === 'win32';
		const pngIconPath = path.join(path.dirname(ctx.iconPath), 'icon.png');

		const focusAndNavigate = () => {
			const targetWin = ctx.getWin();
			if (!targetWin || targetWin.isDestroyed()) return;
			if (targetWin.isMinimized()) targetWin.restore();
			targetWin.show();
			targetWin.focus();
			if (isMac) {
				try {
					app.focus({ steal: true });
				} catch {}
			}

			try {
				targetWin.webContents.send('notification:clicked', payload);
			} catch {}

			if (payload.link && typeof payload.link === 'string') {
				const fullUrl = payload.link.startsWith('http')
					? resolveDesktopTargetUrl(payload.link, {
							isPackaged: app.isPackaged,
							isCanary: app.getVersion().includes('canary'),
							domain: loadEnvDomain(),
						})
					: `${ctx.webUrl}${payload.link.startsWith('/') ? payload.link : '/' + payload.link}`;
				targetWin.loadURL(fullUrl).catch(() => {});
			}
		};

		if (Notification.isSupported()) {
			const winIconImg = !isMac ? resolveWindowIconImage(ctx.iconPath) : undefined;
			const resolvedIcon = !isMac
				? winIconImg && !winIconImg.isEmpty()
					? winIconImg
					: fs.existsSync(pngIconPath)
						? nativeImage.createFromPath(pngIconPath)
						: fs.existsSync(ctx.iconPath)
							? ctx.iconPath
							: undefined
				: undefined;

			const notif = new Notification({
				title: payload.title,
				subtitle: isMac ? payload.subtitle || 'Crea-Accent Studio' : undefined,
				body: payload.body || '',
				icon: resolvedIcon,
				silent: Boolean(payload.silent),
				urgency: payload.urgency || 'normal',
				timeoutType: 'default',
			});

			notif.on('click', focusAndNavigate);
			notif.show();

			if (isMac && (!win || win.isDestroyed() || !win.isFocused())) {
				try {
					app.dock?.bounce('informational');
				} catch {}
			}
		} else if (isWin && tray) {
			try {
				tray.displayBalloon({
					iconType: 'info',
					title: payload.title,
					content: payload.body || '',
				});
			} catch {}
		}

		if (win && !win.isDestroyed() && !win.isFocused()) {
			try {
				win.flashFrame(true);
			} catch {}
		}

		return true;
	} catch (err) {
		ctx.log(`WARNING: Notification dispatch failed: ${(err as Error)?.message || 'unknown'}`);
		return false;
	}
}

export function syncAppBadgeCount(count: number, getTray: () => Tray | null, getWin?: () => BrowserWindow | undefined) {
	const safeCount = Math.max(0, Math.floor(Number(count) || 0));
	try {
		app.setBadgeCount(safeCount);
	} catch {}

	if (process.platform === 'darwin' && app.dock) {
		try {
			app.dock.setBadge(safeCount > 0 ? (safeCount > 99 ? '99+' : String(safeCount)) : '');
		} catch {}
	}

	if (process.platform === 'win32' && getWin) {
		try {
			const win = getWin();
			if (win && !win.isDestroyed()) {
				if (safeCount > 0) {
					const overlayImg = createWindowsBadgeOverlay(safeCount);
					win.setOverlayIcon(overlayImg, `${safeCount} unread notifications`);
				} else {
					win.setOverlayIcon(null, '');
				}
			}
		} catch {}
	}

	try {
		getTray()?.setToolTip(safeCount > 0 ? `Crea-Accent Studio (${safeCount} unread)` : 'Crea-Accent Studio');
	} catch {}
}
