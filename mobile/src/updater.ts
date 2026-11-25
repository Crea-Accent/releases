/** @format */

import { Linking, Platform } from 'react-native';
import { resolveMobileApiBaseUrl } from './metadata';

export const MOBILE_CLIENT_VERSION = '1.0.0';

export interface MobileUpdateCheckResult {
	outdated: boolean;
	currentVersion: string;
	latestVersion: string | null;
	tagName: string | null;
	publishedAt: string | null;
	channel: 'stable' | 'canary';
	platform: 'android' | 'ios';
	downloadUrl: string | null;
	directDownloadUrl: string | null;
	fileName: string | null;
	size: number | null;
}

let cachedMobileUpdateInfo: MobileUpdateCheckResult | null = null;

export function cleanMobileVersionString(raw: string | null | undefined): string {
	if (!raw) return '';
	return raw
		.trim()
		.replace(/^mobile@/i, '')
		.replace(/^v/i, '');
}

export function isRemoteMobileVersionNewer(currentRaw: string, remoteRaw: string | null | undefined): boolean {
	const current = cleanMobileVersionString(currentRaw);
	const remote = cleanMobileVersionString(remoteRaw);
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
	if (currentPre && remotePre && currentPre !== remotePre && /^canary\.[a-f0-9]{5,}$/i.test(remotePre)) {
		return true;
	}

	return false;
}

export async function checkMobileRelease(domainOverride?: string, channelOverride?: 'stable' | 'canary'): Promise<MobileUpdateCheckResult> {
	const currentVersion = cleanMobileVersionString(MOBILE_CLIENT_VERSION);
	const channel: 'stable' | 'canary' = channelOverride || (currentVersion.includes('canary') ? 'canary' : 'stable');
	const platform: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';

	const candidates = Array.from(new Set([resolveMobileApiBaseUrl(domainOverride), 'https://api.crea-accent.app']));

	for (const base of candidates) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 8000);
			const res = await fetch(`${base}/secure/downloads/mobile?channel=${channel}`, {
				signal: controller.signal,
				headers: {
					Accept: 'application/json',
					Origin: 'https://app.crea-accent.app',
				},
			});
			clearTimeout(timeout);

			if (!res.ok) continue;

			type MobileAssetInfo = {
				name: string;
				url?: string;
				directUrl?: string;
				browser_download_url?: string;
				size?: number;
			};

			const data = (await res.json()) as {
				version?: string | null;
				tagName?: string | null;
				publishedAt?: string | null;
				android?: MobileAssetInfo | null;
				ios?: MobileAssetInfo | null;
			};

			// Strictly ignore any accidental desktop@* tag so desktop updates never require a mobile update
			if (data.tagName && String(data.tagName).toLowerCase().startsWith('desktop@')) {
				continue;
			}

			const asset = platform === 'ios' ? data.ios : data.android;
			let latestVersion = cleanMobileVersionString(data.version);
			if (!latestVersion && asset?.name) {
				const match = asset.name.match(/Crea-Accent[\s._-]*Studio[\s._-]*Mobile-(.+?)\.(?:apk|aab|ipa)$/i);
				if (match?.[1]) latestVersion = cleanMobileVersionString(match[1]);
			}
			if (!latestVersion && data.tagName) {
				latestVersion = cleanMobileVersionString(data.tagName);
			}

			const primaryUrl = asset?.url || asset?.browser_download_url || null;
			const directUrl = asset?.directUrl || asset?.browser_download_url || null;
			const outdated = isRemoteMobileVersionNewer(currentVersion, latestVersion);

			const result: MobileUpdateCheckResult = {
				outdated,
				currentVersion,
				latestVersion: latestVersion || null,
				tagName: data.tagName || null,
				publishedAt: data.publishedAt || null,
				channel,
				platform,
				downloadUrl: primaryUrl,
				directDownloadUrl: directUrl,
				fileName: asset?.name || null,
				size: typeof asset?.size === 'number' ? asset.size : null,
			};

			cachedMobileUpdateInfo = result;
			return result;
		} catch {}
	}

	return (
		cachedMobileUpdateInfo || {
			outdated: false,
			currentVersion,
			latestVersion: null,
			tagName: null,
			publishedAt: null,
			channel,
			platform,
			downloadUrl: null,
			directDownloadUrl: null,
			fileName: null,
			size: null,
		}
	);
}

export async function openMobileUpdateInstaller(targetInfo?: MobileUpdateCheckResult, domainOverride?: string): Promise<boolean> {
	const info = targetInfo?.downloadUrl ? targetInfo : await checkMobileRelease(domainOverride);
	const platform: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';
	const fallbackUrl = `${resolveMobileApiBaseUrl(domainOverride)}/secure/downloads/mobile?download=${platform}&channel=${info.channel}`;
	const urlToOpen = info.downloadUrl || info.directDownloadUrl || fallbackUrl;

	try {
		await Linking.openURL(urlToOpen);
		return true;
	} catch {
		return false;
	}
}
