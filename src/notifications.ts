/** @format */

import { BrowserWindow, Notification, Tray, app, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { loadEnvDomain, resolveDesktopTargetUrl, type Metadata } from './metadata.js';
import { createWindowsBadgeOverlay } from './desktopExtras.js';

export const APP_USER_MODEL_ID = 'CreaAccent.Studio.Desktop';

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

export function resolveWindowIconImage(iconPath: string) {
	const dir = iconPath ? path.dirname(iconPath) : '';
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
		const resolvedIcon = iconPath && fs.existsSync(iconPath) ? path.resolve(iconPath) : '';
		const appRoot = resolvedIcon ? path.resolve(path.dirname(resolvedIcon), '..') : process.cwd();
		const relaunchCommand = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${appRoot}"`;
		targetWin.setAppDetails({
			appId: APP_USER_MODEL_ID,
			appIconPath: resolvedIcon || undefined,
			appIconIndex: 0,
			relaunchCommand,
			relaunchDisplayName: 'Crea-Accent Studio',
		});
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
			if (iconPath && fs.existsSync(iconPath)) {
				const resolvedIcon = path.resolve(iconPath);
				const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
				const shortcutPath = path.join(startMenuDir, 'Crea-Accent Studio.lnk');
				const targetArgs = app.isPackaged ? '' : appRootPath || process.cwd();
				const shortcutDetails = {
					target: process.execPath,
					args: targetArgs,
					cwd: app.isPackaged ? path.dirname(process.execPath) : targetArgs,
					description: 'Crea-Accent Studio',
					icon: resolvedIcon,
					iconIndex: 0,
					appUserModelId: APP_USER_MODEL_ID,
				};
				if (!shell.writeShortcutLink(shortcutPath, 'replace', shortcutDetails)) {
					shell.writeShortcutLink(shortcutPath, 'create', shortcutDetails);
				}

				if (!app.isPackaged) {
					const electronShortcutPath = path.join(startMenuDir, 'Electron.lnk');
					if (fs.existsSync(electronShortcutPath)) {
						try {
							fs.unlinkSync(electronShortcutPath);
						} catch {}
					}
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
			const resolvedIcon = !isMac ? (fs.existsSync(pngIconPath) ? nativeImage.createFromPath(pngIconPath) : fs.existsSync(ctx.iconPath) ? ctx.iconPath : undefined) : undefined;

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
