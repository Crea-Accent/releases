/** @format */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type MobileTabId = 'home' | 'dossiers' | 'workspace' | 'pairing' | 'settings';

export type MobileWorkspaceShortcut = 'dashboard' | 'dossiers' | 'agenda' | 'projectMail' | 'mail' | 'account' | 'portal';

export interface MobileMetadata {
	debug: boolean;
	startupTab: MobileTabId;
	biometricLock: boolean;
	pushNotifications: boolean;
	dailyWorkOrderReminder: boolean;
	batterySaver: boolean;
	hapticFeedback: boolean;
	autoSwitchLocalLan: boolean;
	openExternalInBrowser: boolean;
	themeMode: 'dark' | 'light';
	accentColor: string;
	domain: string;
	lastWorkspaceUrl?: string;
}

export const DEFAULT_MOBILE_METADATA: MobileMetadata = {
	debug: false,
	startupTab: 'home',
	biometricLock: false,
	pushNotifications: true,
	dailyWorkOrderReminder: true,
	batterySaver: true,
	hapticFeedback: true,
	autoSwitchLocalLan: true,
	openExternalInBrowser: true,
	themeMode: 'dark',
	accentColor: '#a4b795',
	domain: 'crea-accent.app',
	lastWorkspaceUrl: 'https://app.crea-accent.app',
};

export const WORKSPACE_SHORTCUT_URLS: Record<MobileWorkspaceShortcut, string> = {
	dashboard: 'https://app.crea-accent.app/?tab=home',
	dossiers: 'https://app.crea-accent.app/?tab=dossiers',
	agenda: 'https://app.crea-accent.app/?tab=agenda',
	projectMail: 'https://app.crea-accent.app/?tab=project-mail',
	mail: 'https://app.crea-accent.app/?tab=mail',
	account: 'https://account.crea-accent.app',
	portal: 'https://portal.crea-accent.app',
};

const SUBDOMAIN_TO_PORT: Record<string, string> = {
	www: '4000',
	api: '4001',
	cdn: '4002',
	account: '4003',
	app: '4004',
	docs: '4005',
	admin: '4006',
	info: '4007',
	local: '4008',
	portal: '4009',
};

const STORAGE_KEY = 'crea_accent_mobile_metadata_v1';

let cachedMobileMetadata: MobileMetadata = { ...DEFAULT_MOBILE_METADATA };

export function sanitizeMobileMetadata(raw?: Partial<MobileMetadata> | null): MobileMetadata {
	const merged = { ...DEFAULT_MOBILE_METADATA, ...(raw && typeof raw === 'object' ? raw : {}) };
	const validTabs: MobileTabId[] = ['home', 'dossiers', 'workspace', 'pairing', 'settings'];
	return {
		debug: Boolean(merged.debug),
		startupTab: validTabs.includes(merged.startupTab) ? merged.startupTab : 'home',
		biometricLock: Boolean(merged.biometricLock),
		pushNotifications: merged.pushNotifications !== false,
		dailyWorkOrderReminder: merged.dailyWorkOrderReminder !== false,
		batterySaver: merged.batterySaver !== false,
		hapticFeedback: merged.hapticFeedback !== false,
		autoSwitchLocalLan: merged.autoSwitchLocalLan !== false,
		openExternalInBrowser: merged.openExternalInBrowser !== false,
		themeMode: merged.themeMode === 'light' ? 'light' : 'dark',
		accentColor: typeof merged.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(merged.accentColor.trim()) ? merged.accentColor.trim() : '#a4b795',
		domain: typeof merged.domain === 'string' && merged.domain.trim() ? merged.domain.trim() : 'crea-accent.app',
		lastWorkspaceUrl: typeof merged.lastWorkspaceUrl === 'string' && merged.lastWorkspaceUrl.trim() ? merged.lastWorkspaceUrl.trim() : 'https://app.crea-accent.app',
	};
}

export async function loadMobileMetadata(): Promise<MobileMetadata> {
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Partial<MobileMetadata>;
			cachedMobileMetadata = sanitizeMobileMetadata(parsed);
			return { ...cachedMobileMetadata };
		}
	} catch {}
	return { ...cachedMobileMetadata };
}

export async function saveMobileMetadata(patch: Partial<MobileMetadata>): Promise<MobileMetadata> {
	const updated = sanitizeMobileMetadata({ ...cachedMobileMetadata, ...patch });
	cachedMobileMetadata = updated;
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
	} catch {}
	return { ...updated };
}

export function getCachedMobileMetadata(): MobileMetadata {
	return { ...cachedMobileMetadata };
}

export function isLocalHostOrIp(domainRaw: string): boolean {
	const d = domainRaw.trim().toLowerCase();
	if (d === 'localhost' || d === '127.0.0.1' || d === '10.0.2.2') return true;
	return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(d);
}

export function resolveMobileTargetUrl(baseUrl: string, domainOverride?: string): string {
	const domain = (domainOverride || cachedMobileMetadata.domain || 'crea-accent.app').trim();
	const isLocal = isLocalHostOrIp(domain);

	try {
		const parsed = new URL(baseUrl);
		const hostParts = parsed.hostname.toLowerCase().split('.');
		const sub = hostParts[0] in SUBDOMAIN_TO_PORT ? hostParts[0] : 'app';

		if (isLocal) {
			// On Android emulator, localhost maps to 10.0.2.2 unless a LAN IP was explicitly configured
			const effectiveHost = Platform.OS === 'android' && (domain === 'localhost' || domain === '127.0.0.1') ? '10.0.2.2' : domain;
			parsed.protocol = 'http:';
			parsed.hostname = effectiveHost;
			parsed.port = SUBDOMAIN_TO_PORT[sub] || '4004';
			return parsed.toString();
		}

		const cleanDomain = domain.replace(/^www\./i, '');
		parsed.protocol = 'https:';
		parsed.port = '';
		parsed.hostname = `${sub}.${cleanDomain}`;
		return parsed.toString();
	} catch {
		return baseUrl;
	}
}

export function resolveMobileApiBaseUrl(domainOverride?: string): string {
	return resolveMobileTargetUrl('https://api.crea-accent.app', domainOverride).replace(/\/$/, '');
}

export function parseIncomingDeepLink(rawUrl: string, domain?: string): { tab: MobileTabId; targetUrl?: string; pairCode?: string } {
	try {
		const parsed = new URL(rawUrl);
		const codeParam = parsed.searchParams.get('code');
		if (codeParam && codeParam.trim().length >= 6) {
			return {
				tab: 'pairing',
				pairCode: codeParam
					.trim()
					.toUpperCase()
					.replace(/[^A-Z0-9]/g, '')
					.slice(0, 6),
			};
		}

		const urlParam = parsed.searchParams.get('url');
		if (urlParam && /^https?:\/\//i.test(urlParam)) {
			return {
				tab: 'workspace',
				targetUrl: resolveMobileTargetUrl(urlParam, domain),
			};
		}
	} catch {}

	const stripped = rawUrl.replace(/^crea-accent:\/\//i, '').replace(/^\/+/, '');
	if (stripped.toLowerCase().startsWith('pair') || stripped.toLowerCase().startsWith('qr')) {
		const codeMatch = stripped.match(/[?&]code=([A-Za-z0-9-]+)/);
		return {
			tab: 'pairing',
			pairCode: codeMatch?.[1]
				?.replace(/[^A-Za-z0-9]/g, '')
				.toUpperCase()
				.slice(0, 6),
		};
	}
	if (stripped.toLowerCase().startsWith('dossiers')) {
		return { tab: 'dossiers' };
	}
	if (stripped.toLowerCase().startsWith('settings')) {
		return { tab: 'settings' };
	}
	if (stripped && stripped.toLowerCase() !== 'open' && stripped.toLowerCase() !== 'home') {
		return {
			tab: 'workspace',
			targetUrl: resolveMobileTargetUrl(`https://app.crea-accent.app/${stripped}`, domain),
		};
	}

	return { tab: 'home' };
}
