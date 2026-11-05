/** @format */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type MobileWorkspaceShortcut, resolveMobileApiBaseUrl, WORKSPACE_SHORTCUT_URLS } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface MobileCalendarItem {
	id: string;
	graphEventId?: string;
	subject: string;
	startAt: string;
	endAt: string;
	location?: string;
	eventType?: 'algemeen' | 'afspraak' | 'taak' | 'call' | 'werkbon';
	isCompleted?: boolean;
	werkbon?: {
		isWerkbon?: boolean;
		status?: 'open' | 'signed' | 'invoiced';
		workedHours?: number | null;
	};
}

interface HomeScreenProps {
	domain: string;
	theme: MobileThemePalette;
	onOpenWorkspaceUrl: (url: string) => void;
}

export function HomeScreen({ domain, theme, onOpenWorkspaceUrl }: HomeScreenProps) {
	const [events, setEvents] = useState<MobileCalendarItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [completedIds, setCompletedIds] = useState<string[]>([]);

	const fetchToday = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setRefreshing(true);
			else setLoading(true);

			try {
				const now = new Date();
				const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
				const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59);
				const apiBase = resolveMobileApiBaseUrl(domain);
				const url = `${apiBase}/secure/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;

				const res = await fetch(url, {
					credentials: 'include',
					headers: { Accept: 'application/json' },
				});
				if (res.ok) {
					const data = await res.json();
					if (Array.isArray(data?.events)) {
						setEvents(data.events);
					}
				}
			} catch {
				// Offline or unauthenticated; user can sign in via Studio / Pairing tab
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[domain]
	);

	useEffect(() => {
		fetchToday(false);
	}, [fetchToday]);

	const toggleComplete = async (item: MobileCalendarItem) => {
		const isDone = Boolean(item.isCompleted || completedIds.includes(item.id));
		const nextDone = !isDone;
		setCompletedIds((prev) => (nextDone ? [...prev, item.id] : prev.filter((id) => id !== item.id)));

		try {
			const apiBase = resolveMobileApiBaseUrl(domain);
			await fetch(`${apiBase}/secure/calendar/events`, {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					eventId: item.id,
					graphEventId: item.graphEventId,
					isCompleted: nextDone,
					...(item.werkbon?.isWerkbon ? { isWerkbon: true, werkbonStatus: nextDone ? 'signed' : 'open' } : {}),
				}),
			});
		} catch {}
	};

	const appointments = events.filter((e) => e.eventType !== 'taak' && e.eventType !== 'call');
	const tasks = events.filter((e) => e.eventType === 'taak' || e.eventType === 'call');
	const werkbonnen = events.filter((e) => e.werkbon?.isWerkbon);

	const shortcuts: Array<{ key: MobileWorkspaceShortcut; label: string; subtitle: string }> = [
		{ key: 'agenda', label: 'Agenda & Werkbonnen', subtitle: 'Planning & urenregistratie' },
		{ key: 'dossiers', label: 'Dossiers & Projecten', subtitle: 'NAS, Trikker & Duotecno' },
		{ key: 'projectMail', label: 'Project Mail', subtitle: 'Gekoppelde e-mails' },
		{ key: 'mail', label: 'Mailbox', subtitle: 'Outlook & klantenmail' },
	];

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: theme.background }]}
			contentContainerStyle={styles.content}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchToday(true)} tintColor={theme.accent} />}
		>
			{/* Hero Header Card */}
			<View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<View style={styles.heroHeaderRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.heroOverline, { color: theme.accent }]}>CREA-ACCENT STUDIO MOBILE</Text>
						<Text style={[styles.heroTitle, { color: theme.text }]}>Vandaag op het programma</Text>
						<Text style={[styles.heroSubtitle, { color: theme.textMuted }]}>{new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
					</View>
					<TouchableOpacity activeOpacity={0.8} onPress={() => onOpenWorkspaceUrl(WORKSPACE_SHORTCUT_URLS.dashboard)} style={[styles.openStudioPill, { backgroundColor: theme.accent }]}>
						<Text style={styles.openStudioPillText}>Open Studio →</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.statsRow}>
					<View style={[styles.statPill, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.statNumber, { color: theme.accent }]}>{appointments.length}</Text>
						<Text style={[styles.statLabel, { color: theme.textMuted }]}>Afspraken</Text>
					</View>
					<View style={[styles.statPill, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.statNumber, { color: theme.accent }]}>{tasks.length}</Text>
						<Text style={[styles.statLabel, { color: theme.textMuted }]}>Taken & Calls</Text>
					</View>
					<View style={[styles.statPill, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.statNumber, { color: theme.accentOrange }]}>{werkbonnen.length}</Text>
						<Text style={[styles.statLabel, { color: theme.textMuted }]}>Werkbonnen</Text>
					</View>
				</View>
			</View>

			{/* Quick Launch Grid */}
			<View style={styles.gridRow}>
				{shortcuts.map((item) => (
					<TouchableOpacity
						key={item.key}
						activeOpacity={0.8}
						onPress={() => onOpenWorkspaceUrl(WORKSPACE_SHORTCUT_URLS[item.key])}
						style={[styles.shortcutCard, { backgroundColor: theme.card, borderColor: theme.border }]}
					>
						<Text style={[styles.shortcutTitle, { color: theme.text }]}>{item.label}</Text>
						<Text style={[styles.shortcutSub, { color: theme.textMuted }]}>{item.subtitle}</Text>
					</TouchableOpacity>
				))}
			</View>

			{/* Today's Schedule & Werkbonnen */}
			<View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<View style={styles.sectionHeader}>
					<Text style={[styles.sectionTitle, { color: theme.text }]}>Planning & Taken Vandaag</Text>
					<TouchableOpacity onPress={() => onOpenWorkspaceUrl(WORKSPACE_SHORTCUT_URLS.agenda)}>
						<Text style={[styles.sectionAction, { color: theme.accent }]}>Volledige Agenda</Text>
					</TouchableOpacity>
				</View>

				{loading ? (
					<View style={styles.emptyBox}>
						<ActivityIndicator size="small" color={theme.accent} />
						<Text style={[styles.emptyText, { color: theme.textMuted }]}>Agenda en werkbonnen ophalen…</Text>
					</View>
				) : events.length === 0 ? (
					<View style={[styles.emptyBox, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen openstaande items geladen</Text>
						<Text style={[styles.emptyText, { color: theme.textMuted }]}>
							Open de Studio-tab of koppel je toestel met een 6-cijferige code om je live agenda en werkbonnen te bekijken.
						</Text>
					</View>
				) : (
					events.slice(0, 10).map((item) => {
						const isDone = Boolean(item.isCompleted || completedIds.includes(item.id) || item.werkbon?.status === 'signed');
						const timeLabel = new Date(item.startAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

						return (
							<TouchableOpacity
								key={item.id}
								activeOpacity={0.75}
								onPress={() => toggleComplete(item)}
								style={[styles.eventRow, { backgroundColor: theme.recessed, borderColor: isDone ? theme.accentBorder : theme.border }]}
							>
								<View style={[styles.checkCircle, { borderColor: isDone ? theme.accentGreen : theme.accent, backgroundColor: isDone ? theme.accentSoft : 'transparent' }]}>
									{isDone && <Text style={{ color: theme.accentGreen, fontSize: 12, fontWeight: '800' }}>✓</Text>}
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.eventSubject, { color: theme.text, opacity: isDone ? 0.6 : 1 }]} numberOfLines={1}>
										{item.subject}
									</Text>
									<Text style={[styles.eventMeta, { color: theme.textMuted }]} numberOfLines={1}>
										{timeLabel}
										{item.location ? ` • ${item.location}` : ''}
										{item.werkbon?.isWerkbon ? ' • Werkbon' : ''}
									</Text>
								</View>
							</TouchableOpacity>
						);
					})
				)}
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 32 },
	heroCard: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 14 },
	heroHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
	heroOverline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
	heroTitle: { fontSize: 20, fontWeight: '800' },
	heroSubtitle: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
	openStudioPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
	openStudioPillText: { color: '#090b09', fontSize: 12, fontWeight: '800' },
	statsRow: { flexDirection: 'row', gap: 8 },
	statPill: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
	statNumber: { fontSize: 18, fontWeight: '800' },
	statLabel: { fontSize: 11, marginTop: 2 },
	gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
	shortcutCard: { width: '48%', flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 14 },
	shortcutTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
	shortcutSub: { fontSize: 11 },
	sectionCard: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 10 },
	sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
	sectionTitle: { fontSize: 15, fontWeight: '800' },
	sectionAction: { fontSize: 12, fontWeight: '700' },
	emptyBox: { borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 6 },
	emptyTitle: { fontSize: 13, fontWeight: '700' },
	emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
	eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
	checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
	eventSubject: { fontSize: 13, fontWeight: '700' },
	eventMeta: { fontSize: 11, marginTop: 2 },
});
