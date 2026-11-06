/** @format */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getCachedMobileMetadata } from './metadata';

export interface MobileNotificationPayload {
	id?: string;
	title: string;
	body?: string;
	subtitle?: string;
	link?: string | null;
	silent?: boolean;
	urgency?: 'normal' | 'critical' | 'low';
	force?: boolean;
}

export async function configureMobileNotifications(): Promise<boolean> {
	try {
		if (Platform.OS === 'android') {
			await Notifications.setNotificationChannelAsync('crea-accent-default', {
				name: 'Crea-Accent Studio',
				importance: Notifications.AndroidImportance.HIGH,
				vibrationPattern: [0, 200, 120, 200],
				lightColor: '#a4b795',
			});
			await Notifications.setNotificationChannelAsync('crea-accent-werkbon', {
				name: 'Werkbonnen & Planning',
				importance: Notifications.AndroidImportance.MAX,
				vibrationPattern: [0, 250, 150, 250],
				lightColor: '#a4b795',
			});
		}

		const existing = await Notifications.getPermissionsAsync();
		if (existing.status === 'granted') return true;

		const requested = await Notifications.requestPermissionsAsync();
		return requested.status === 'granted';
	} catch {
		return false;
	}
}

export async function dispatchMobileNotification(payload: MobileNotificationPayload): Promise<boolean> {
	const meta = getCachedMobileMetadata();
	if (!payload.force && meta.pushNotifications === false) {
		return false;
	}

	try {
		const permitted = await configureMobileNotifications();
		if (!permitted) return false;

		await Notifications.scheduleNotificationAsync({
			content: {
				title: payload.title,
				body: payload.body || '',
				subtitle: payload.subtitle,
				sound: !payload.silent,
				data: {
					id: payload.id || `mobile-${Date.now()}`,
					link: payload.link || null,
				},
			},
			trigger: null,
		});
		return true;
	} catch {
		return false;
	}
}

export async function syncMobileBadgeCount(count: number): Promise<void> {
	try {
		const normalized = Math.max(0, Math.floor(Number(count) || 0));
		await Notifications.setBadgeCountAsync(normalized);
	} catch {}
}

export async function scheduleDailyWerkbonReminder(enabled: boolean): Promise<boolean> {
	if (!enabled) return false;
	try {
		const permitted = await configureMobileNotifications();
		if (!permitted) return false;

		await Notifications.scheduleNotificationAsync({
			content: {
				title: 'Werkbonnen van vandaag nakijken',
				body: 'Vergeet niet om je gepresteerde uren en gebruikte materialen van vandaag in te vullen.',
				sound: true,
				data: { link: 'crea-accent://home' },
			},
			trigger: {
				hour: 16,
				minute: 45,
				repeats: true,
			},
		});
		return true;
	} catch {
		return false;
	}
}
