/** @format */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export type MobileTabId = 'home' | 'agenda' | 'dossiers' | 'mail' | 'settings';

export type MobileWorkspaceShortcut = 'dashboard' | 'dossiers' | 'agenda' | 'projectMail' | 'mail' | 'stock' | 'energy' | 'files' | 'account' | 'admin' | 'info' | 'portal';

export type StartupLocation = 'last' | 'overview' | 'dossiers' | 'agenda' | 'mail' | 'energy' | 'files' | 'account';

export type ConnectionMode = 'auto' | 'lan' | 'cloud';

export interface SavedDesktopAccount {
	id: string;
	name: string;
	email: string;
	avatar?: string;
	role?: string;
	lastActiveAt: number;
}

export interface MobileMetadata {
	debug: boolean;
	openAtLogin: boolean;
	minimizeToTray: boolean;
	hardwareAcceleration: boolean;
	keepAwake: boolean;
	startupLocation: StartupLocation;
	windowControls: 'right' | 'left';
	streamerMode: boolean;
	rememberLastPage: boolean;
	startupTab: MobileTabId;
	biometricLock: boolean;
	pushNotifications: boolean;
	dailyWorkOrderReminder: boolean;
	batterySaver: boolean;
	hapticFeedback: boolean;
	autoSwitchLocalLan: boolean;
	openExternalInBrowser: boolean;
	dockCollapsed: boolean;
	themeMode: 'dark' | 'light';
	accentColor: string;
	connectionMode: ConnectionMode;
	lanHost: string;
	domain: string;
	activeUserId: string;
	activeUserName: string;
	activeUserEmail: string;
	activeUserRole: string;
	lastWorkspaceUrl?: string;
}

export function detectExpoPackagerLanIp(): string | null {
	try {
		const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
		if (scriptURL && typeof scriptURL === 'string') {
			const match = scriptURL.match(/^[a-zA-Z]+:\/\/([0-9]{1,3}(?:\.[0-9]{1,3}){3})(?::\d+)?/);
			if (match?.[1] && match[1] !== '127.0.0.1') {
				return match[1];
			}
		}
	} catch {}
	return null;
}

const DETECTED_DEV_LAN_IP = detectExpoPackagerLanIp();

export const DEFAULT_MOBILE_METADATA: MobileMetadata = {
	debug: false,
	openAtLogin: false,
	minimizeToTray: true,
	hardwareAcceleration: true,
	keepAwake: false,
	startupLocation: 'overview',
	windowControls: Platform.OS === 'ios' ? 'left' : 'right',
	streamerMode: false,
	rememberLastPage: true,
	startupTab: 'home',
	biometricLock: false,
	pushNotifications: true,
	dailyWorkOrderReminder: true,
	batterySaver: true,
	hapticFeedback: true,
	autoSwitchLocalLan: false,
	openExternalInBrowser: true,
	dockCollapsed: false,
	themeMode: 'dark',
	accentColor: '#a4b795',
	connectionMode: 'cloud',
	lanHost: DETECTED_DEV_LAN_IP || '',
	domain: 'crea-accent.app',
	activeUserId: 'ray-dev',
	activeUserName: 'Ray De Crom',
	activeUserEmail: 'ray@crea-accent.be',
	activeUserRole: 'Administrator',
	lastWorkspaceUrl: 'https://app.crea-accent.app',
};

export const WORKSPACE_SHORTCUT_URLS: Record<MobileWorkspaceShortcut, string> = {
	dashboard: 'https://app.crea-accent.app',
	dossiers: 'https://app.crea-accent.app/dossiers',
	agenda: 'https://app.crea-accent.app/agenda',
	projectMail: 'https://app.crea-accent.app/project-mail',
	mail: 'https://app.crea-accent.app/mail',
	stock: 'https://app.crea-accent.app/stock',
	energy: 'https://app.crea-accent.app/energy',
	files: 'https://app.crea-accent.app/files',
	account: 'https://account.crea-accent.app',
	admin: 'https://admin.crea-accent.app',
	info: 'https://info.crea-accent.app',
	portal: 'https://portal.crea-accent.app',
};

const SUBDOMAIN_TO_PORT: Record<string, string> = {
	www: '4000',
	api: '4003',
	cdn: '4002',
	account: '4003',
	auth: '4003',
	app: '4004',
	dossiers: '4004',
	mail: '4004',
	docs: '4005',
	admin: '4006',
	info: '4007',
	local: '5001',
	files: '5001',
	nas: '5001',
	portal: '4009',
	database: '5000',
	energy: '5002',
	power: '5002',
	stream: '5003',
};

const PORT_TO_SUBDOMAIN: Record<string, string> = {
	'4000': 'www',
	'4001': 'api',
	'4002': 'cdn',
	'4003': 'account',
	'4004': 'app',
	'4005': 'docs',
	'4006': 'admin',
	'4007': 'info',
	'4008': 'local',
	'4009': 'portal',
	'5000': 'database',
	'5001': 'local',
	'5002': 'energy',
	'5003': 'stream',
};

const STORAGE_KEY = 'crea_accent_mobile_metadata_v3';
const ACCOUNTS_STORAGE_KEY = 'crea_accent_mobile_accounts_v1';

let cachedMobileMetadata: MobileMetadata = { ...DEFAULT_MOBILE_METADATA };
let cachedAccounts: SavedDesktopAccount[] = [];
const mobileLogBuffer: string[] = [];

export function appendMobileLog(entry: string): void {
	const line = `[${new Date().toISOString()}] ${entry}`;
	mobileLogBuffer.push(line);
	if (mobileLogBuffer.length > 300) {
		mobileLogBuffer.shift();
	}
}

export function getMobileLogs(): string[] {
	return [...mobileLogBuffer];
}

export function isLocalHostOrIp(domainRaw: string): boolean {
	const d = domainRaw.trim().toLowerCase();
	if (d === 'localhost' || d === '127.0.0.1' || d === '10.0.2.2') return true;
	return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(d);
}

export function getEffectiveDomain(meta: MobileMetadata = cachedMobileMetadata): string {
	const detectedIp = detectExpoPackagerLanIp() || meta.lanHost;
	if (meta.connectionMode === 'lan') {
		if (isLocalHostOrIp(meta.domain)) return meta.domain;
		if (detectedIp) return detectedIp;
		return 'localhost';
	}
	return meta.domain && !isLocalHostOrIp(meta.domain) ? meta.domain : 'crea-accent.app';
}

export function sanitizeMobileMetadata(raw?: Partial<MobileMetadata> | null): MobileMetadata {
	const merged = { ...DEFAULT_MOBILE_METADATA, ...(raw && typeof raw === 'object' ? raw : {}) };
	const validTabs: MobileTabId[] = ['home', 'agenda', 'dossiers', 'mail', 'settings'];
	const validLocations: StartupLocation[] = ['last', 'overview', 'dossiers', 'agenda', 'mail', 'energy', 'files', 'account'];
	const validModes: ConnectionMode[] = ['auto', 'lan', 'cloud'];

	const detectedLan = detectExpoPackagerLanIp();
	const lanHost = typeof merged.lanHost === 'string' && isLocalHostOrIp(merged.lanHost) ? merged.lanHost.trim() : detectedLan || '';
	const connectionMode: ConnectionMode = validModes.includes(merged.connectionMode) ? merged.connectionMode : 'cloud';

	let domain = typeof merged.domain === 'string' && merged.domain.trim() ? merged.domain.trim() : 'crea-accent.app';
	if (connectionMode === 'lan' && lanHost) {
		domain = lanHost;
	} else if (connectionMode !== 'lan' && isLocalHostOrIp(domain)) {
		domain = 'crea-accent.app';
	}

	return {
		debug: Boolean(merged.debug),
		openAtLogin: Boolean(merged.openAtLogin),
		minimizeToTray: merged.minimizeToTray !== false,
		hardwareAcceleration: merged.hardwareAcceleration !== false,
		keepAwake: Boolean(merged.keepAwake),
		startupLocation: validLocations.includes(merged.startupLocation) ? merged.startupLocation : 'overview',
		windowControls: merged.windowControls === 'left' ? 'left' : 'right',
		streamerMode: Boolean(merged.streamerMode),
		rememberLastPage: merged.rememberLastPage !== false,
		startupTab: validTabs.includes(merged.startupTab) ? merged.startupTab : 'home',
		biometricLock: Boolean(merged.biometricLock),
		pushNotifications: merged.pushNotifications !== false,
		dailyWorkOrderReminder: merged.dailyWorkOrderReminder !== false,
		batterySaver: merged.batterySaver !== false,
		hapticFeedback: merged.hapticFeedback !== false,
		autoSwitchLocalLan: Boolean(merged.autoSwitchLocalLan),
		openExternalInBrowser: merged.openExternalInBrowser !== false,
		dockCollapsed: Boolean(merged.dockCollapsed),
		themeMode: merged.themeMode === 'light' ? 'light' : 'dark',
		accentColor: typeof merged.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(merged.accentColor.trim()) ? merged.accentColor.trim() : '#a4b795',
		connectionMode,
		lanHost,
		domain,
		activeUserId: typeof merged.activeUserId === 'string' && merged.activeUserId.trim() ? merged.activeUserId.trim() : 'ray-dev',
		activeUserName: typeof merged.activeUserName === 'string' && merged.activeUserName.trim() ? merged.activeUserName.trim() : 'Ray De Crom',
		activeUserEmail: typeof merged.activeUserEmail === 'string' && merged.activeUserEmail.trim() ? merged.activeUserEmail.trim() : 'ray@crea-accent.be',
		activeUserRole: typeof merged.activeUserRole === 'string' && merged.activeUserRole.trim() ? merged.activeUserRole.trim() : 'Administrator',
		lastWorkspaceUrl: 'https://app.crea-accent.app',
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
	cachedMobileMetadata = sanitizeMobileMetadata(DEFAULT_MOBILE_METADATA);
	return { ...cachedMobileMetadata };
}

export async function saveMobileMetadata(patch: Partial<MobileMetadata>): Promise<MobileMetadata> {
	const nextPatch = { ...patch };
	if (typeof nextPatch.domain === 'string') {
		const d = nextPatch.domain.trim();
		if (isLocalHostOrIp(d)) {
			nextPatch.lanHost = d;
			if (!nextPatch.connectionMode) nextPatch.connectionMode = 'lan';
		} else if (d) {
			if (!nextPatch.connectionMode) nextPatch.connectionMode = 'cloud';
		}
	}
	const updated = sanitizeMobileMetadata({ ...cachedMobileMetadata, ...nextPatch });
	cachedMobileMetadata = updated;
	try {
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
	} catch {}
	return { ...updated };
}

export function getCachedMobileMetadata(): MobileMetadata {
	return { ...cachedMobileMetadata };
}

export async function loadSavedAccounts(): Promise<SavedDesktopAccount[]> {
	try {
		const raw = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				cachedAccounts = parsed;
				return [...cachedAccounts];
			}
		}
	} catch {}
	return [...cachedAccounts];
}

export async function syncSavedAccountProfile(profile: Partial<SavedDesktopAccount> & { id?: string; email?: string }): Promise<SavedDesktopAccount[]> {
	if (!profile || (!profile.id && !profile.email)) return [...cachedAccounts];
	const id = String(profile.id || profile.email);
	const existingIdx = cachedAccounts.findIndex((a) => a.id === id || (profile.email && a.email === profile.email));
	const entry: SavedDesktopAccount = {
		id,
		name: profile.name || profile.email || 'Crea-Accent User',
		email: profile.email || '',
		avatar: profile.avatar,
		role: profile.role,
		lastActiveAt: Date.now(),
	};
	if (existingIdx >= 0) {
		cachedAccounts[existingIdx] = { ...cachedAccounts[existingIdx], ...entry };
	} else {
		cachedAccounts.unshift(entry);
	}
	try {
		await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(cachedAccounts));
	} catch {}
	return [...cachedAccounts];
}

export async function removeSavedAccount(accountId: string): Promise<SavedDesktopAccount[]> {
	cachedAccounts = cachedAccounts.filter((a) => a.id !== accountId && a.email !== accountId);
	try {
		await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(cachedAccounts));
	} catch {}
	return [...cachedAccounts];
}

export function resolveMobileTargetUrl(baseUrl: string, domainOverride?: string): string {
	const rawDomain = (domainOverride || getEffectiveDomain(cachedMobileMetadata) || 'crea-accent.app').trim();
	const isLocal = isLocalHostOrIp(rawDomain);

	try {
		const parsed = new URL(baseUrl);
		const hostParts = parsed.hostname.toLowerCase().split('.');
		const subFromPort = parsed.port && PORT_TO_SUBDOMAIN[parsed.port] ? PORT_TO_SUBDOMAIN[parsed.port] : null;
		const sub = hostParts[0] in SUBDOMAIN_TO_PORT ? hostParts[0] : subFromPort || 'app';

		if (isLocal) {
			const effectiveHost = Platform.OS === 'android' && (rawDomain === 'localhost' || rawDomain === '127.0.0.1') ? '10.0.2.2' : rawDomain;
			parsed.protocol = 'http:';
			parsed.hostname = effectiveHost;
			parsed.port = SUBDOMAIN_TO_PORT[sub] || parsed.port || '4004';
			return parsed.toString();
		}

		const cleanDomain = rawDomain.replace(/^www\./i, '');
		const effectiveSub = sub === 'api' || sub === 'auth' ? 'account' : sub;
		parsed.protocol = 'https:';
		parsed.port = '';
		parsed.hostname = `${effectiveSub}.${cleanDomain}`;
		return parsed.toString();
	} catch {
		return baseUrl;
	}
}

export function resolveMobileApiBaseUrl(domainOverride?: string): string {
	return resolveMobileTargetUrl('https://account.crea-accent.app', domainOverride).replace(/\/$/, '');
}

export function parseIncomingDeepLink(rawUrl: string): { tab: MobileTabId; dossierId?: string; pairCode?: string } | null {
	if (!rawUrl || typeof rawUrl !== 'string') return null;

	if (/^exp(?:s)?:\/\//i.test(rawUrl)) {
		const expoDeepLinkIdx = rawUrl.indexOf('/--/');
		if (expoDeepLinkIdx === -1) {
			return null;
		}
		rawUrl = `crea-accent://${rawUrl.slice(expoDeepLinkIdx + 4)}`;
	}

	try {
		const parsed = new URL(rawUrl);
		const codeParam = parsed.searchParams.get('code');
		if (codeParam && codeParam.trim().length >= 6) {
			return {
				tab: 'settings',
				pairCode: codeParam
					.trim()
					.toUpperCase()
					.replace(/[^A-Z0-9]/g, '')
					.slice(0, 6),
			};
		}
	} catch {}

	const stripped = rawUrl.replace(/^crea-accent:\/\//i, '').replace(/^\/+/, '');
	if (!stripped) return null;

	if (stripped.toLowerCase().startsWith('pair') || stripped.toLowerCase().startsWith('qr')) {
		const codeMatch = stripped.match(/[?&]code=([A-Za-z0-9-]+)/);
		return {
			tab: 'settings',
			pairCode: codeMatch?.[1]
				?.replace(/[^A-Za-z0-9]/g, '')
				.toUpperCase()
				.slice(0, 6),
		};
	}
	if (stripped.toLowerCase().startsWith('dossiers')) {
		return { tab: 'dossiers' };
	}
	if (stripped.toLowerCase().startsWith('agenda')) {
		return { tab: 'agenda' };
	}
	if (stripped.toLowerCase().startsWith('mail')) {
		return { tab: 'mail' };
	}
	if (stripped.toLowerCase().startsWith('settings')) {
		return { tab: 'settings' };
	}

	return { tab: 'home' };
}
