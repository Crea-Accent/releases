/** @format */

import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Linking, Platform, Share } from 'react-native';
import { verifyMobileBiometrics } from './biometrics';
import { type MobileMetadata, type MobileTabId, getCachedMobileMetadata, saveMobileMetadata } from './metadata';
import { type MobileNotificationPayload, dispatchMobileNotification, syncMobileBadgeCount } from './notifications';
import { MOBILE_CLIENT_VERSION, checkMobileRelease, openMobileUpdateInstaller } from './updater';

export function buildMobileUserAgent(): string {
	const osLabel = Platform.OS === 'ios' ? 'iOS' : 'Android';
	return `Mozilla/5.0 (${osLabel}; Mobile) CreaAccentMobile/${MOBILE_CLIENT_VERSION} CreaAccentStudio/${MOBILE_CLIENT_VERSION}`;
}

export function buildInjectedMobileBridgeScript(meta: MobileMetadata): string {
	const initialMetaJson = JSON.stringify(meta);
	const platformStr = Platform.OS === 'ios' ? 'ios' : 'android';

	return `
(function() {
	if (window.creaMobile) return;
	var currentMeta = ${initialMetaJson};
	var pendingCallbacks = {};
	var callbackCounter = 0;
	var metaListeners = [];
	var updateListeners = [];

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
		}
		if (msg.event === 'update:state' && msg.data) {
			updateListeners.forEach(function(fn) { try { fn(msg.data); } catch (e) {} });
			window.dispatchEvent(new CustomEvent('crea:mobile-update-state', { detail: msg.data }));
		}
	};

	window.creaMobile = {
		isMobileApp: true,
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
		notify: function(payload) { return invokeNative('app:notify', payload); },
		setBadgeCount: function(count) { postToNative('app:setBadgeCount', { count: count }); },
		verifyBiometrics: function(reason) { return invokeNative('biometrics:verify', { reason: reason }); },
		writeClipboardText: function(text) { return invokeNative('app:writeClipboardText', { text: text }); },
		haptic: function(style) { postToNative('app:haptic', { style: style || 'light' }); },
		share: function(payload) { return invokeNative('app:share', payload); },
		openExternal: function(url) { return invokeNative('app:openExternal', { url: url }); },
		openPairing: function() { postToNative('nav:switchTab', { tab: 'pairing' }); },
		checkForUpdate: function() { return invokeNative('app:checkForUpdate', {}); },
		installUpdate: function() { return invokeNative('app:installUpdate', {}); }
	};

	document.documentElement.classList.add('is-mobile-app');
})();
true;
`;
}

export interface BridgeContext {
	sendToWebView: (payload: { requestId?: string | null; event?: string; data?: any }) => void;
	onSwitchTab: (tab: MobileTabId) => void;
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
			ctx.onMetadataChanged(updated);
			ctx.sendToWebView({ event: 'metadata:updated', data: updated });
			reply(updated);
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
