/** @format */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking, Platform, Share } from 'react-native';
import { getBiometricSupportInfo, verifyMobileBiometrics } from './biometrics';
import {
	appendMobileLog,
	getCachedMobileMetadata,
	getMobileLogs,
	loadSavedAccounts,
	type MobileMetadata,
	type MobileTabId,
	removeSavedAccount,
	resolveMobileTargetUrl,
	saveMobileMetadata,
	syncSavedAccountProfile,
} from './metadata';
import { dispatchMobileNotification, type MobileNotificationPayload, syncMobileBadgeCount } from './notifications';
import { checkMobileRelease, MOBILE_CLIENT_VERSION, openMobileUpdateInstaller } from './updater';

export function buildMobileUserAgent(): string {
	const osLabel = Platform.OS === 'ios' ? 'iOS' : 'Android';
	return `Mozilla/5.0 (${osLabel}; Mobile) CreaAccentMobile/${MOBILE_CLIENT_VERSION} CreaAccentStudio/${MOBILE_CLIENT_VERSION}`;
}

export function buildInjectedMobileBridgeScript(meta: MobileMetadata): string {
	const initialMetaJson = JSON.stringify(meta);
	const platformStr = Platform.OS === 'ios' ? 'ios' : 'android';

	return `
(function() {
	if (window.creaMobile && window.__creaBridgeInitialized) return;
	window.__creaBridgeInitialized = true;
	var currentMeta = ${initialMetaJson};
	var pendingCallbacks = {};
	var callbackCounter = 0;
	var metaListeners = [];
	var updateListeners = [];
	var powerListeners = [];
	var statusListeners = [];
	var errorListeners = [];
	var logListeners = [];

	function postToNative(type, payload, requestId) {
		try {
			if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
				window.ReactNativeWebView.postMessage(JSON.stringify({
					type: type,
					payload: payload || {},
					requestId: requestId || null
				}));
			}
		} catch (e) {}
	}

	function invokeNative(type, payload) {
		return new Promise(function(resolve) {
			var reqId = 'req_' + (++callbackCounter) + '_' + Date.now();
			pendingCallbacks[reqId] = resolve;
			postToNative(type, payload, reqId);
			setTimeout(function() {
				if (pendingCallbacks[reqId]) {
					delete pendingCallbacks[reqId];
					resolve(null);
				}
			}, 12000);
		});
	}

	window.__creaMobileReceive = function(msg) {
		if (!msg || typeof msg !== 'object') return;
		if (msg.requestId && pendingCallbacks[msg.requestId]) {
			var cb = pendingCallbacks[msg.requestId];
			delete pendingCallbacks[msg.requestId];
			cb(msg.data);
			return;
		}
		if (msg.event === 'metadata:updated' && msg.data) {
			currentMeta = Object.assign({}, currentMeta, msg.data);
			metaListeners.forEach(function(fn) { try { fn(currentMeta); } catch (e) {} });
			window.dispatchEvent(new CustomEvent('crea:mobile-metadata-updated', { detail: currentMeta }));
			window.dispatchEvent(new CustomEvent('crea:desktop-metadata-updated', { detail: currentMeta }));
		}
		if (msg.event === 'update:state' && msg.data) {
			updateListeners.forEach(function(fn) { try { fn(msg.data); } catch (e) {} });
			window.dispatchEvent(new CustomEvent('crea:mobile-update-state', { detail: msg.data }));
			window.dispatchEvent(new CustomEvent('crea:desktop-update-state', { detail: msg.data }));
		}
		if (msg.event === 'power:state' && msg.data) {
			powerListeners.forEach(function(fn) { try { fn(msg.data); } catch (e) {} });
			window.dispatchEvent(new CustomEvent('crea:desktop-power-state', { detail: msg.data }));
		}
		if (msg.event === 'logs:entry' && msg.data) {
			logListeners.forEach(function(fn) { try { fn(msg.data); } catch (e) {} });
		}
	};

	var bridgeApi = {
		isMobileApp: true,
		isDesktopApp: false,
		platform: '${platformStr}',
		version: '${MOBILE_CLIENT_VERSION}',
		get metadata() { return Object.assign({}, currentMeta); },
		getMetadata: function() { return invokeNative('metadata:get', {}); },
		updateMetadata: function(patch) {
			currentMeta = Object.assign({}, currentMeta, patch || {});
			return invokeNative('metadata:set', patch || {});
		},
		onMetadataUpdated: function(cb) {
			metaListeners.push(cb);
			return function() {
				metaListeners = metaListeners.filter(function(item) { return item !== cb; });
			};
		},
		onStatus: function(cb) { statusListeners.push(cb); },
		onError: function(cb) { errorListeners.push(cb); },
		onMaximizedChange: function() { return function() {}; },
		onOnlineStatusChange: function(cb) {
			var onOnline = function() { cb(true); };
			var onOffline = function() { cb(false); };
			window.addEventListener('online', onOnline);
			window.addEventListener('offline', onOffline);
			return function() {
				window.removeEventListener('online', onOnline);
				window.removeEventListener('offline', onOffline);
			};
		},
		getPowerState: function() { return invokeNative('power:getState', {}); },
		onPowerStateChange: function(cb) {
			powerListeners.push(cb);
			return function() {
				powerListeners = powerListeners.filter(function(item) { return item !== cb; });
			};
		},
		getUpdateState: function() { return invokeNative('app:checkForUpdate', {}); },
		onUpdateStateChange: function(cb) {
			updateListeners.push(cb);
			return function() {
				updateListeners = updateListeners.filter(function(item) { return item !== cb; });
			};
		},
		checkForUpdate: function() { return invokeNative('app:checkForUpdate', {}); },
		installUpdate: function() { return invokeNative('app:installUpdate', {}); },
		notify: function(payload) { return invokeNative('app:notify', payload); },
		setBadgeCount: function(count) { postToNative('app:setBadgeCount', { count: count }); },
		verifyBiometrics: function(reason) { return invokeNative('biometrics:verify', { reason: reason }); },
		lockPrivacyShield: function() { postToNative('shield:lock', {}); },
		unlockPrivacyShield: function() { return invokeNative('shield:unlock', {}); },
		onPrivacyShieldChange: function() { return function() {}; },
		clearCache: function() { return invokeNative('app:clearCache', {}); },
		getLogs: function() { return invokeNative('logs:get', {}); },
		onLogEntry: function(cb) {
			logListeners.push(cb);
			return function() {
				logListeners = logListeners.filter(function(item) { return item !== cb; });
			};
		},
		getAccounts: function() { return invokeNative('accounts:get', {}); },
		syncAccountProfile: function(profile) { return invokeNative('accounts:syncProfile', profile); },
		switchAccount: function(accountId) { return invokeNative('accounts:switch', { accountId: accountId }); },
		removeAccount: function(accountId) { return invokeNative('accounts:remove', { accountId: accountId }); },
		addAccount: function() { return invokeNative('accounts:add', {}); },
		writeClipboardText: function(text) { return invokeNative('app:writeClipboardText', { text: text }); },
		haptic: function(style) { postToNative('app:haptic', { style: style || 'light' }); },
		share: function(payload) { return invokeNative('app:share', payload); },
		openExternal: function(url) { return invokeNative('app:openExternal', { url: url }); },
		openPairing: function() { postToNative('nav:openSheet', { sheet: 'pairing' }); },
		openQuickSheet: function() { postToNative('nav:openSheet', { sheet: 'quick' }); },
		restart: function() { postToNative('app:reload', {}); },
		quit: function() {},
		minimize: function() {},
		maximize: function() {},
		close: function() {}
	};

	window.creaMobile = bridgeApi;
	if (!window.electron) {
		window.electron = bridgeApi;
	}

	document.documentElement.classList.add('is-mobile-app');
})();
true;
`;
}

export interface BridgeContext {
	sendToWebView: (payload: { requestId?: string | null; event?: string; data?: any }) => void;
	onSwitchTab: (tab: MobileTabId) => void;
	onOpenSheet?: (sheet: 'quick' | 'pairing' | 'settings') => void;
	onLockShield?: () => void;
	onUnlockShield?: () => Promise<boolean>;
	onNavigateUrl?: (url: string) => void;
	onReloadWebView?: () => void;
	onMetadataChanged: (meta: MobileMetadata) => void;
}

export async function handleWebViewBridgeMessage(rawData: string, ctx: BridgeContext): Promise<void> {
	let parsed: { type?: string; payload?: any; requestId?: string | null } | null = null;
	try {
		parsed = JSON.parse(rawData);
	} catch {
		return;
	}
	if (!parsed?.type) return;

	const { type, payload, requestId } = parsed;
	const reply = (data: any) => {
		if (requestId) {
			ctx.sendToWebView({ requestId, data });
		}
	};

	switch (type) {
		case 'metadata:get': {
			reply(getCachedMobileMetadata());
			break;
		}
		case 'metadata:set': {
			const updated = await saveMobileMetadata(payload || {});
			appendMobileLog(`Metadata updated: ${JSON.stringify(payload || {})}`);
			ctx.onMetadataChanged(updated);
			ctx.sendToWebView({ event: 'metadata:updated', data: updated });
			reply(updated);
			break;
		}
		case 'power:getState': {
			const bio = await getBiometricSupportInfo();
			const meta = getCachedMobileMetadata();
			reply({
				onBattery: meta.batterySaver,
				batterySaverActive: meta.batterySaver,
				biometricAvailable: bio.supported,
				biometricLabel: bio.label,
				shieldLocked: false,
			});
			break;
		}
		case 'app:notify': {
			const ok = await dispatchMobileNotification(payload as MobileNotificationPayload);
			reply(ok);
			break;
		}
		case 'app:setBadgeCount': {
			await syncMobileBadgeCount(Number(payload?.count || 0));
			reply(true);
			break;
		}
		case 'biometrics:verify': {
			const verified = await verifyMobileBiometrics(payload?.reason);
			reply(verified);
			break;
		}
		case 'shield:lock': {
			ctx.onLockShield?.();
			reply(true);
			break;
		}
		case 'shield:unlock': {
			const unlocked = ctx.onUnlockShield ? await ctx.onUnlockShield() : await verifyMobileBiometrics('Ontgrendel Crea-Accent Studio');
			reply(unlocked);
			break;
		}
		case 'app:clearCache': {
			appendMobileLog('WebView cache cleared & reloaded');
			ctx.onReloadWebView?.();
			reply(true);
			break;
		}
		case 'app:reload': {
			ctx.onReloadWebView?.();
			reply(true);
			break;
		}
		case 'logs:get': {
			reply(getMobileLogs());
			break;
		}
		case 'accounts:get': {
			const accounts = await loadSavedAccounts();
			reply({
				accounts,
				activeAccountId: accounts[0]?.id || null,
			});
			break;
		}
		case 'accounts:syncProfile': {
			const accounts = await syncSavedAccountProfile(payload || {});
			reply({
				accounts,
				activeAccountId: accounts[0]?.id || null,
			});
			break;
		}
		case 'accounts:switch': {
			const loginUrl = resolveMobileTargetUrl('https://account.crea-accent.app/login');
			ctx.onNavigateUrl?.(loginUrl);
			reply(true);
			break;
		}
		case 'accounts:remove': {
			const accounts = await removeSavedAccount(String(payload?.accountId || ''));
			reply({
				accounts,
				activeAccountId: accounts[0]?.id || null,
			});
			break;
		}
		case 'accounts:add': {
			const loginUrl = resolveMobileTargetUrl('https://account.crea-accent.app/login');
			ctx.onNavigateUrl?.(loginUrl);
			reply(true);
			break;
		}
		case 'app:writeClipboardText': {
			try {
				await Clipboard.setStringAsync(String(payload?.text || ''));
				reply(true);
			} catch {
				reply(false);
			}
			break;
		}
		case 'app:haptic': {
			if (getCachedMobileMetadata().hapticFeedback !== false) {
				try {
					await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				} catch {}
			}
			reply(true);
			break;
		}
		case 'app:share': {
			try {
				await Share.share({
					title: payload?.title || 'Crea-Accent Studio',
					message: payload?.message || payload?.url || '',
					url: payload?.url,
				});
				reply(true);
			} catch {
				reply(false);
			}
			break;
		}
		case 'app:openExternal': {
			if (payload?.url && /^https?:\/\//i.test(String(payload.url))) {
				try {
					await Linking.openURL(String(payload.url));
					reply(true);
					return;
				} catch {}
			}
			reply(false);
			break;
		}
		case 'nav:switchTab': {
			if (payload?.tab) {
				ctx.onSwitchTab(payload.tab as MobileTabId);
			}
			reply(true);
			break;
		}
		case 'nav:openSheet': {
			if (payload?.sheet && ctx.onOpenSheet) {
				ctx.onOpenSheet(payload.sheet);
			}
			reply(true);
			break;
		}
		case 'app:checkForUpdate': {
			const info = await checkMobileRelease();
			ctx.sendToWebView({ event: 'update:state', data: info });
			reply(info);
			break;
		}
		case 'app:installUpdate': {
			const ok = await openMobileUpdateInstaller();
			reply(ok);
			break;
		}
		default:
			reply(null);
	}
}
