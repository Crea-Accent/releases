/** @format */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchCalendarWorkspace, type StudioCalendarEvent, type StudioDossierSummary, updateCalendarItem } from '../api';
import { CalendarEventModal } from '../components/CalendarEventModal';
import { type MobileMetadata, type MobileTabId } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface HomeScreenProps {
	metadata: MobileMetadata;
	theme: MobileThemePalette;
	onSelectTab: (tab: MobileTabId) => void;
	onOpenDossier: (dossierId: string) => void;
}

type HomeFeedFilter = 'upcoming' | 'today' | 'werkbon' | 'tasks';

export function HomeScreen({ metadata, theme, onSelectTab, onOpenDossier }: HomeScreenProps) {
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [events, setEvents] = useState<StudioCalendarEvent[]>([]);
	const [dossiers, setDossiers] = useState<StudioDossierSummary[]>([]);
	const [feedFilter, setFeedFilter] = useState<HomeFeedFilter>('upcoming');

	const [modalOpen, setModalOpen] = useState(false);
	const [modalMode, setModalMode] = useState<'view' | 'create'>('view');
	const [modalDefaultType, setModalDefaultType] = useState<'afspraak' | 'werkbon' | 'call' | 'taak'>('afspraak');
	const [selectedEvent, setSelectedEvent] = useState<StudioCalendarEvent | null>(null);

	const loadWorkspace = useCallback(async () => {
		try {
			const res = await fetchCalendarWorkspace({
				userId: metadata.activeUserId,
				domain: metadata.domain,
			});
			setEvents(res.events);
			setDossiers(res.dossiers);
		} catch {
			// Keep previous state on transient network error
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [metadata.activeUserId, metadata.domain]);

	useEffect(() => {
		void loadWorkspace();
	}, [loadWorkspace]);

	const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

	const stats = useMemo(() => {
		let todayCount = 0;
		let werkbonCount = 0;
		let taskCallCount = 0;

		for (const ev of events) {
			const startDay = String(ev.startAt || '').slice(0, 10);
			if (startDay === todayKey) todayCount++;
			const isWb = ev.eventType === 'werkbon' || Boolean(ev.werkbon?.isWerkbon);
			if (isWb && !ev.isCompleted) werkbonCount++;
			if ((ev.eventType === 'call' || ev.eventType === 'taak') && !ev.isCompleted) taskCallCount++;
		}

		return {
			todayCount,
			werkbonCount,
			taskCallCount,
			dossierCount: dossiers.length,
		};
	}, [events, dossiers.length, todayKey]);

	const filteredEvents = useMemo(() => {
		const nowMs = Date.now() - 12 * 3600 * 1000;
		const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

		if (feedFilter === 'today') {
			return sorted.filter((ev) => String(ev.startAt || '').slice(0, 10) === todayKey);
		}
		if (feedFilter === 'werkbon') {
			return sorted.filter((ev) => ev.eventType === 'werkbon' || Boolean(ev.werkbon?.isWerkbon)).reverse();
		}
		if (feedFilter === 'tasks') {
			return sorted.filter((ev) => ev.eventType === 'call' || ev.eventType === 'taak' || !ev.isCompleted).slice(0, 25);
		}
		// 'upcoming': show today + upcoming items (or recent if none upcoming)
		const upcoming = sorted.filter((ev) => new Date(ev.endAt || ev.startAt).getTime() >= nowMs);
		return upcoming.length > 0 ? upcoming.slice(0, 25) : sorted.slice(-20).reverse();
	}, [events, feedFilter, todayKey]);

	const recentDossiers = useMemo(() => {
		return [...dossiers].sort((a, b) => new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime()).slice(0, 8);
	}, [dossiers]);

	const handleQuickToggleComplete = async (ev: StudioCalendarEvent) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		const nextCompleted = !ev.isCompleted;
		setEvents((prev) => prev.map((item) => (item.id === ev.id ? { ...item, isCompleted: nextCompleted } : item)));
		try {
			const updated = await updateCalendarItem(
				{
					eventId: ev.id,
					graphEventId: ev.graphEventId,
					userId: metadata.activeUserId,
					isCompleted: nextCompleted,
					eventSnapshot: ev,
				},
				metadata.domain
			);
			if (updated) {
				setEvents((prev) => prev.map((item) => (item.id === ev.id ? { ...item, ...updated } : item)));
			}
		} catch {}
	};

	const openCreateModal = (type: 'afspraak' | 'werkbon' | 'call' | 'taak') => {
		void Haptics.selectionAsync().catch(() => {});
		setSelectedEvent(null);
		setModalDefaultType(type);
		setModalMode('create');
		setModalOpen(true);
	};

	const openInspectModal = (ev: StudioCalendarEvent) => {
		void Haptics.selectionAsync().catch(() => {});
		setSelectedEvent(ev);
		setModalMode('view');
		setModalOpen(true);
	};

	const openLocationInMaps = (loc: string) => {
		const encoded = encodeURIComponent(loc);
		const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
		void Linking.openURL(url).catch(() => {});
	};

	const formatEventTime = (ev: StudioCalendarEvent) => {
		try {
			const d = new Date(ev.startAt);
			const datePart = d.toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' });
			if (ev.isAllDay) return `${datePart} • Hele dag`;
			const timePart = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
			return `${datePart} • ${timePart}`;
		} catch {
			return '';
		}
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			<ScrollView
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={() => {
							setRefreshing(true);
							void loadWorkspace();
						}}
						tintColor={theme.accent}
					/>
				}
			>
				{/* Hero Command Header */}
				<View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
					<View style={styles.heroTopRow}>
						<View style={{ flex: 1 }}>
							<Text style={[styles.overline, { color: theme.accent }]}>CREA-ACCENT STUDIO · ON-THE-GO</Text>
							<Text style={[styles.heroTitle, { color: theme.text }]}>Welkom, {metadata.activeUserName.split(' ')[0]}</Text>
							<Text style={[styles.heroSubtitle, { color: theme.textMuted }]}>
								{new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })} • {metadata.activeUserRole}
							</Text>
						</View>
						<TouchableOpacity
							activeOpacity={0.8}
							onPress={() => onSelectTab('settings')}
							style={[styles.userBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
						>
							<Text style={[styles.userBadgeText, { color: theme.accent }]}>
								{metadata.activeUserName
									.split(' ')
									.map((p) => p[0])
									.join('')
									.slice(0, 2)
									.toUpperCase()}
							</Text>
						</TouchableOpacity>
					</View>

					{/* 1-Tap On-The-Go Creation Bar */}
					<View style={styles.quickCreateRow}>
						<TouchableOpacity activeOpacity={0.85} onPress={() => openCreateModal('werkbon')} style={[styles.quickCreateBtnPrimary, { backgroundColor: theme.accent }]}>
							<Text style={styles.quickCreateBtnPrimaryText}>+ Werkbon</Text>
						</TouchableOpacity>
						<TouchableOpacity
							activeOpacity={0.85}
							onPress={() => openCreateModal('afspraak')}
							style={[styles.quickCreateBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
						>
							<Text style={[styles.quickCreateBtnText, { color: theme.text }]}>+ Afspraak</Text>
						</TouchableOpacity>
						<TouchableOpacity activeOpacity={0.85} onPress={() => openCreateModal('call')} style={[styles.quickCreateBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
							<Text style={[styles.quickCreateBtnText, { color: theme.text }]}>+ Call / Taak</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Live KPI Tiles */}
				<View style={styles.kpiGrid}>
					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => setFeedFilter('today')}
						style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: feedFilter === 'today' ? theme.accent : theme.border }]}
					>
						<Text style={[styles.kpiValue, { color: theme.accent }]}>{stats.todayCount}</Text>
						<Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Vandaag</Text>
					</TouchableOpacity>

					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => setFeedFilter('werkbon')}
						style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: feedFilter === 'werkbon' ? theme.accent : theme.border }]}
					>
						<Text style={[styles.kpiValue, { color: theme.text }]}>{stats.werkbonCount}</Text>
						<Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Werkbonnen</Text>
					</TouchableOpacity>

					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => setFeedFilter('tasks')}
						style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: feedFilter === 'tasks' ? theme.accent : theme.border }]}
					>
						<Text style={[styles.kpiValue, { color: theme.text }]}>{stats.taskCallCount}</Text>
						<Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Calls & Taken</Text>
					</TouchableOpacity>

					<TouchableOpacity activeOpacity={0.8} onPress={() => onSelectTab('dossiers')} style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
						<Text style={[styles.kpiValue, { color: theme.accent }]}>{stats.dossierCount}</Text>
						<Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Dossiers →</Text>
					</TouchableOpacity>
				</View>

				{/* Interactive Schedule & Werkbonnen Section */}
				<View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
					<View style={styles.sectionHeaderRow}>
						<View>
							<Text style={[styles.sectionTitle, { color: theme.text }]}>Planning & Werkbonnen</Text>
							<Text style={[styles.sectionSub, { color: theme.textMuted }]}>Tik op een item om uren, materiaal of status aan te passen</Text>
						</View>
						<TouchableOpacity activeOpacity={0.8} onPress={() => onSelectTab('agenda')}>
							<Text style={[styles.linkText, { color: theme.accent }]}>Volledige Agenda →</Text>
						</TouchableOpacity>
					</View>

					{/* Filter Pills */}
					<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
						{[
							{ id: 'upcoming' as const, label: 'Komende & Actief' },
							{ id: 'today' as const, label: `Vandaag (${stats.todayCount})` },
							{ id: 'werkbon' as const, label: `Werkbonnen (${stats.werkbonCount})` },
							{ id: 'tasks' as const, label: `Taken & Calls (${stats.taskCallCount})` },
						].map((f) => {
							const active = feedFilter === f.id;
							return (
								<TouchableOpacity
									key={f.id}
									activeOpacity={0.8}
									onPress={() => setFeedFilter(f.id)}
									style={[
										styles.filterPill,
										{
											backgroundColor: active ? theme.accentSoft : theme.recessed,
											borderColor: active ? theme.accentBorder : theme.border,
										},
									]}
								>
									<Text style={[styles.filterPillText, { color: active ? theme.accent : theme.textMuted }]}>{f.label}</Text>
								</TouchableOpacity>
							);
						})}
					</ScrollView>

					{loading ? (
						<View style={styles.loaderBox}>
							<ActivityIndicator size="small" color={theme.accent} />
							<Text style={[styles.loaderText, { color: theme.textMuted }]}>Studio agenda & werkbonnen ophalen...</Text>
						</View>
					) : filteredEvents.length === 0 ? (
						<View style={[styles.emptyBox, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
							<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen items in deze weergave</Text>
							<Text style={[styles.emptySub, { color: theme.textMuted }]}>Tik hierboven op + Werkbon of + Afspraak om direct iets in te plannen.</Text>
						</View>
					) : (
						<View style={styles.eventList}>
							{filteredEvents.map((ev) => {
								const isWb = ev.eventType === 'werkbon' || Boolean(ev.werkbon?.isWerkbon);
								const linked = ev.linkedTargets?.[0];
								return (
									<TouchableOpacity
										key={ev.id}
										activeOpacity={0.82}
										onPress={() => openInspectModal(ev)}
										style={[
											styles.eventRow,
											{
												backgroundColor: theme.recessed,
												borderColor: isWb ? theme.accentBorder : theme.border,
												opacity: ev.isCompleted ? 0.68 : 1,
											},
										]}
									>
										{/* 1-Tap Check-off Button */}
										<TouchableOpacity
											activeOpacity={0.8}
											onPress={() => void handleQuickToggleComplete(ev)}
											style={[
												styles.checkCircle,
												{
													backgroundColor: ev.isCompleted ? theme.accentGreen : 'transparent',
													borderColor: ev.isCompleted ? theme.accentGreen : theme.accent,
												},
											]}
										>
											<Text style={[styles.checkGlyph, { color: ev.isCompleted ? '#090b09' : theme.accent }]}>{ev.isCompleted ? '✓' : ''}</Text>
										</TouchableOpacity>

										<View style={{ flex: 1, gap: 3 }}>
											<View style={styles.eventMetaRow}>
												<Text style={[styles.eventTime, { color: theme.accent }]}>{formatEventTime(ev)}</Text>
												<View style={[styles.typeBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
													<Text style={[styles.typeBadgeText, { color: isWb ? theme.accent : theme.textMuted }]}>
														{isWb ? `WERKBON ${ev.werkbon?.code || ''}`.trim() : String(ev.eventType || 'AFSPRAAK').toUpperCase()}
													</Text>
												</View>
											</View>

											<Text
												style={[
													styles.eventTitle,
													{
														color: theme.text,
														textDecorationLine: ev.isCompleted ? 'line-through' : 'none',
													} as any,
												]}
												numberOfLines={1}
											>
												{ev.subject}
											</Text>

											{Boolean(ev.location) && (
												<TouchableOpacity activeOpacity={0.8} onPress={() => openLocationInMaps(ev.location!)}>
													<Text style={[styles.eventLocation, { color: theme.textMuted }]} numberOfLines={1}>
														📍 {ev.location}
													</Text>
												</TouchableOpacity>
											)}

											{linked && (
												<TouchableOpacity
													activeOpacity={0.8}
													onPress={() => onOpenDossier(linked.dossierId)}
													style={[styles.dossierChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
												>
													<Text style={[styles.dossierChipText, { color: theme.accent }]} numberOfLines={1}>
														📁 {linked.dossierCode} · {linked.dossierName}
													</Text>
												</TouchableOpacity>
											)}
										</View>
									</TouchableOpacity>
								);
							})}
						</View>
					)}
				</View>

				{/* Recent Active Dossiers Section */}
				<View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
					<View style={styles.sectionHeaderRow}>
						<View>
							<Text style={[styles.sectionTitle, { color: theme.text }]}>Recente Dossiers ({dossiers.length})</Text>
							<Text style={[styles.sectionSub, { color: theme.textMuted }]}>Open een dossier voor tijdlijn, veldnotities, offertes & schema’s</Text>
						</View>
						<TouchableOpacity activeOpacity={0.8} onPress={() => onSelectTab('dossiers')}>
							<Text style={[styles.linkText, { color: theme.accent }]}>Alle {dossiers.length} →</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.dossierGrid}>
						{recentDossiers.map((d) => (
							<TouchableOpacity
								key={d.id}
								activeOpacity={0.82}
								onPress={() => onOpenDossier(d.id)}
								style={[styles.dossierMiniCard, { backgroundColor: theme.recessed, borderColor: theme.border }]}
							>
								<View style={styles.dossierMiniHeader}>
									<Text style={[styles.dossierCode, { color: theme.accent }]}>{d.dossierCode || 'DOSSIER'}</Text>
									<Text style={[styles.projectCountBadge, { color: theme.textMuted }]}>{(d.projects || []).length} sub</Text>
								</View>
								<Text style={[styles.dossierName, { color: theme.text }]} numberOfLines={1}>
									{d.name}
								</Text>
								{Boolean(d.address) && (
									<Text style={[styles.dossierAddr, { color: theme.textMuted }]} numberOfLines={1}>
										📍 {d.address}
									</Text>
								)}
							</TouchableOpacity>
						))}
					</View>
				</View>
			</ScrollView>

			<CalendarEventModal
				visible={modalOpen}
				mode={modalMode}
				event={selectedEvent}
				dossiers={dossiers}
				defaultType={modalDefaultType}
				userId={metadata.activeUserId}
				domain={metadata.domain}
				theme={theme}
				onClose={() => setModalOpen(false)}
				onSaved={(saved) => {
					setEvents((prev) => {
						const exists = prev.some((e) => e.id === saved.id);
						return exists ? prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)) : [saved, ...prev];
					});
				}}
				onDeleted={(deletedId) => {
					setEvents((prev) => prev.filter((e) => e.id !== deletedId));
				}}
				onOpenDossier={onOpenDossier}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 14, gap: 12, paddingBottom: 28 },
	heroCard: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 14 },
	heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
	heroTitle: { fontSize: 22, fontWeight: '900', marginTop: 2 },
	heroSubtitle: { fontSize: 12, marginTop: 2 },
	userBadge: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
	userBadgeText: { fontSize: 15, fontWeight: '900' },
	quickCreateRow: { flexDirection: 'row', gap: 8 },
	quickCreateBtnPrimary: { flex: 1.1, paddingVertical: 11, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
	quickCreateBtnPrimaryText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	quickCreateBtn: { flex: 1, paddingVertical: 11, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
	quickCreateBtnText: { fontSize: 12, fontWeight: '800' },
	kpiGrid: { flexDirection: 'row', gap: 8 },
	kpiCard: { flex: 1, borderRadius: 20, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
	kpiValue: { fontSize: 20, fontWeight: '900' },
	kpiLabel: { fontSize: 10, fontWeight: '700' },
	sectionCard: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12 },
	sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	sectionTitle: { fontSize: 16, fontWeight: '800' },
	sectionSub: { fontSize: 11, marginTop: 1 },
	linkText: { fontSize: 12, fontWeight: '800' },
	filterPillsRow: { flexDirection: 'row', gap: 6 },
	filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	filterPillText: { fontSize: 11, fontWeight: '800' },
	loaderBox: { paddingVertical: 22, alignItems: 'center', gap: 8 },
	loaderText: { fontSize: 12 },
	emptyBox: { borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 4 },
	emptyTitle: { fontSize: 13, fontWeight: '800' },
	emptySub: { fontSize: 11, textAlign: 'center' },
	eventList: { gap: 8 },
	eventRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 18, borderWidth: 1, padding: 12, gap: 10 },
	checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
	checkGlyph: { fontSize: 13, fontWeight: '900' },
	eventMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
	eventTime: { fontSize: 11, fontWeight: '800' },
	typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
	typeBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
	eventTitle: { fontSize: 14, fontWeight: '800' },
	eventLocation: { fontSize: 11, fontWeight: '600' },
	dossierChip: { alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
	dossierChipText: { fontSize: 10, fontWeight: '800' },
	dossierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	dossierMiniCard: { width: '48.5%', borderRadius: 18, borderWidth: 1, padding: 12, gap: 4 },
	dossierMiniHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	dossierCode: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
	projectCountBadge: { fontSize: 10, fontWeight: '700' },
	dossierName: { fontSize: 13, fontWeight: '800' },
	dossierAddr: { fontSize: 11 },
});
