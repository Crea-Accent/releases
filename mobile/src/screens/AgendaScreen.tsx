/** @format */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fetchCalendarWorkspace, type StudioCalendarEvent, type StudioDossierSummary, updateCalendarItem } from '../api';
import { CalendarEventModal } from '../components/CalendarEventModal';
import { type MobileMetadata } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface AgendaScreenProps {
	metadata: MobileMetadata;
	theme: MobileThemePalette;
	onOpenDossier: (dossierId: string) => void;
}

type AgendaFilter = 'all' | 'today' | 'werkbon' | 'calls' | 'completed';

export function AgendaScreen({ metadata, theme, onOpenDossier }: AgendaScreenProps) {
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [events, setEvents] = useState<StudioCalendarEvent[]>([]);
	const [dossiers, setDossiers] = useState<StudioDossierSummary[]>([]);
	const [search, setSearch] = useState('');
	const [filter, setFilter] = useState<AgendaFilter>('all');

	const [modalOpen, setModalOpen] = useState(false);
	const [modalMode, setModalMode] = useState<'view' | 'create'>('view');
	const [modalDefaultType, setModalDefaultType] = useState<'afspraak' | 'werkbon' | 'call' | 'taak'>('afspraak');
	const [selectedEvent, setSelectedEvent] = useState<StudioCalendarEvent | null>(null);

	const loadCalendar = useCallback(async () => {
		try {
			const res = await fetchCalendarWorkspace({
				userId: metadata.activeUserId,
				domain: metadata.domain,
			});
			setEvents(res.events);
			setDossiers(res.dossiers);
		} catch {
			// Retain existing items on offline/error
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [metadata.activeUserId, metadata.domain]);

	useEffect(() => {
		void loadCalendar();
	}, [loadCalendar]);

	const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

	const filteredEvents = useMemo(() => {
		const q = search.trim().toLowerCase();
		return events
			.filter((ev) => {
				if (filter === 'today' && String(ev.startAt || '').slice(0, 10) !== todayKey) return false;
				if (filter === 'werkbon' && ev.eventType !== 'werkbon' && !ev.werkbon?.isWerkbon) return false;
				if (filter === 'calls' && ev.eventType !== 'call' && ev.eventType !== 'taak') return false;
				if (filter === 'completed' && !ev.isCompleted) return false;

				if (!q) return true;
				const linkedText = (ev.linkedTargets || []).map((t) => `${t.dossierCode} ${t.dossierName} ${t.projectName || ''}`).join(' ');
				return (
					(ev.subject || '').toLowerCase().includes(q) ||
					(ev.location || '').toLowerCase().includes(q) ||
					(ev.bodyPreview || '').toLowerCase().includes(q) ||
					(ev.werkbon?.code || '').toLowerCase().includes(q) ||
					linkedText.toLowerCase().includes(q)
				);
			})
			.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
	}, [events, filter, search, todayKey]);

	const groupedByDate = useMemo(() => {
		const groups: Array<{ dateKey: string; label: string; items: StudioCalendarEvent[] }> = [];
		const map = new Map<string, StudioCalendarEvent[]>();

		for (const ev of filteredEvents) {
			const dk = String(ev.startAt || '').slice(0, 10) || 'Onbekend';
			const arr = map.get(dk) || [];
			arr.push(ev);
			map.set(dk, arr);
		}

		for (const [dateKey, items] of map.entries()) {
			let label = dateKey;
			try {
				const d = new Date(`${dateKey}T12:00:00`);
				if (dateKey === todayKey) {
					label = `Vandaag • ${d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}`;
				} else {
					label = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
				}
			} catch {}
			groups.push({ dateKey, label, items });
		}

		return groups;
	}, [filteredEvents, todayKey]);

	const toggleCompletion = async (ev: StudioCalendarEvent) => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		const next = !ev.isCompleted;
		setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, isCompleted: next } : e)));
		try {
			const saved = await updateCalendarItem(
				{
					eventId: ev.id,
					graphEventId: ev.graphEventId,
					userId: metadata.activeUserId,
					isCompleted: next,
					eventSnapshot: ev,
				},
				metadata.domain
			);
			if (saved) {
				setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...saved } : e)));
			}
		} catch {}
	};

	const openMaps = (loc: string) => {
		const encoded = encodeURIComponent(loc);
		const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
		void Linking.openURL(url).catch(() => {});
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			{/* Top Header & Search */}
			<View style={[styles.topHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
				<View style={styles.titleRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: theme.accent }]}>STUDIO AGENDA & CAFCA WERKBONNEN</Text>
						<Text style={[styles.title, { color: theme.text }]}>Planning ({filteredEvents.length})</Text>
					</View>
					<View style={styles.createBtnsRow}>
						<TouchableOpacity
							activeOpacity={0.85}
							onPress={() => {
								setSelectedEvent(null);
								setModalDefaultType('werkbon');
								setModalMode('create');
								setModalOpen(true);
							}}
							style={[styles.addBtnPrimary, { backgroundColor: theme.accent }]}
						>
							<Text style={styles.addBtnPrimaryText}>+ Werkbon</Text>
						</TouchableOpacity>
						<TouchableOpacity
							activeOpacity={0.85}
							onPress={() => {
								setSelectedEvent(null);
								setModalDefaultType('afspraak');
								setModalMode('create');
								setModalOpen(true);
							}}
							style={[styles.addBtnSecondary, { backgroundColor: theme.recessed, borderColor: theme.border }]}
						>
							<Text style={[styles.addBtnSecondaryText, { color: theme.text }]}>+ Afspraak</Text>
						</TouchableOpacity>
					</View>
				</View>

				<TextInput
					value={search}
					onChangeText={setSearch}
					placeholder="Zoek afspraak, werkbon, adres of dossier..."
					placeholderTextColor={theme.textMuted}
					style={[styles.searchInput, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
				/>

				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
					{[
						{ id: 'all' as const, label: `Alle (${events.length})` },
						{ id: 'today' as const, label: 'Vandaag' },
						{ id: 'werkbon' as const, label: 'Werkbonnen' },
						{ id: 'calls' as const, label: 'Calls & Taken' },
						{ id: 'completed' as const, label: 'Afgerond' },
					].map((tab) => {
						const active = filter === tab.id;
						return (
							<TouchableOpacity
								key={tab.id}
								activeOpacity={0.8}
								onPress={() => setFilter(tab.id)}
								style={[
									styles.filterChip,
									{
										backgroundColor: active ? theme.accentSoft : theme.recessed,
										borderColor: active ? theme.accentBorder : theme.border,
									},
								]}
							>
								<Text style={[styles.filterChipText, { color: active ? theme.accent : theme.textMuted }]}>{tab.label}</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			</View>

			{loading ? (
				<View style={styles.centerBox}>
					<ActivityIndicator size="large" color={theme.accent} />
					<Text style={[styles.loadingText, { color: theme.textMuted }]}>Agenda & werkbonnen laden...</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={styles.listContent}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={() => {
								setRefreshing(true);
								void loadCalendar();
							}}
							tintColor={theme.accent}
						/>
					}
				>
					{groupedByDate.length === 0 ? (
						<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
							<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen agenda-items gevonden</Text>
							<Text style={[styles.emptySub, { color: theme.textMuted }]}>Pas je zoekterm aan of maak een nieuwe afspraak of werkbon aan.</Text>
						</View>
					) : (
						groupedByDate.map((group) => (
							<View key={group.dateKey} style={styles.dateGroup}>
								<Text style={[styles.dateGroupHeader, { color: theme.accent }]}>{group.label.toUpperCase()}</Text>
								{group.items.map((ev) => {
									const isWb = ev.eventType === 'werkbon' || Boolean(ev.werkbon?.isWerkbon);
									const linked = ev.linkedTargets?.[0];
									const startStr = ev.isAllDay
										? 'Hele dag'
										: `${new Date(ev.startAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(ev.endAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;

									return (
										<TouchableOpacity
											key={ev.id}
											activeOpacity={0.82}
											onPress={() => {
												setSelectedEvent(ev);
												setModalMode('view');
												setModalOpen(true);
											}}
											style={[
												styles.eventCard,
												{
													backgroundColor: theme.card,
													borderColor: isWb ? theme.accentBorder : theme.border,
													opacity: ev.isCompleted ? 0.7 : 1,
												},
											]}
										>
											<TouchableOpacity
												activeOpacity={0.8}
												onPress={() => void toggleCompletion(ev)}
												style={[
													styles.checkBtn,
													{
														backgroundColor: ev.isCompleted ? theme.accentGreen : 'transparent',
														borderColor: ev.isCompleted ? theme.accentGreen : theme.accent,
													},
												]}
											>
												<Text style={[styles.checkBtnText, { color: ev.isCompleted ? '#090b09' : theme.accent }]}>{ev.isCompleted ? '✓' : ''}</Text>
											</TouchableOpacity>

											<View style={{ flex: 1, gap: 4 }}>
												<View style={styles.metaRow}>
													<Text style={[styles.timeText, { color: theme.accent }]}>{startStr}</Text>
													<View style={[styles.badge, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
														<Text style={[styles.badgeText, { color: isWb ? theme.accent : theme.textMuted }]}>
															{isWb ? `WERKBON ${ev.werkbon?.code || ''}`.trim() : String(ev.eventType || 'AFSPRAAK').toUpperCase()}
														</Text>
													</View>
												</View>

												<Text style={[styles.subjectText, { color: theme.text }]} numberOfLines={2}>
													{ev.subject}
												</Text>

												{isWb && (ev.werkbon?.status || ev.werkbon?.workedHours) && (
													<Text style={[styles.wbMetaText, { color: theme.accent }]}>
														Status: {ev.werkbon?.status || 'Ingepland'}
														{ev.werkbon?.workedHours ? ` • ${ev.werkbon.workedHours}u gepresteerd` : ''}
													</Text>
												)}

												{Boolean(ev.location) && (
													<TouchableOpacity activeOpacity={0.8} onPress={() => openMaps(ev.location!)}>
														<Text style={[styles.locationText, { color: theme.textMuted }]} numberOfLines={1}>
															📍 {ev.location}
														</Text>
													</TouchableOpacity>
												)}

												{linked && (
													<TouchableOpacity
														activeOpacity={0.8}
														onPress={() => onOpenDossier(linked.dossierId)}
														style={[styles.linkedPill, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
													>
														<Text style={[styles.linkedPillText, { color: theme.accent }]} numberOfLines={1}>
															📁 {linked.dossierCode} · {linked.dossierName}
														</Text>
													</TouchableOpacity>
												)}
											</View>
										</TouchableOpacity>
									);
								})}
							</View>
						))
					)}
				</ScrollView>
			)}

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
	topHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
	titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
	title: { fontSize: 20, fontWeight: '900' },
	createBtnsRow: { flexDirection: 'row', gap: 6 },
	addBtnPrimary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
	addBtnPrimaryText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	addBtnSecondary: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
	addBtnSecondaryText: { fontSize: 12, fontWeight: '800' },
	searchInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
	filterRow: { flexDirection: 'row', gap: 6 },
	filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	filterChipText: { fontSize: 11, fontWeight: '800' },
	centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
	loadingText: { fontSize: 13 },
	listContent: { padding: 14, gap: 16, paddingBottom: 32 },
	emptyCard: { borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center', gap: 6 },
	emptyTitle: { fontSize: 15, fontWeight: '800' },
	emptySub: { fontSize: 12, textAlign: 'center' },
	dateGroup: { gap: 8 },
	dateGroupHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 0.9, marginLeft: 4 },
	eventCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
	checkBtn: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
	checkBtnText: { fontSize: 13, fontWeight: '900' },
	metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	timeText: { fontSize: 11, fontWeight: '800' },
	badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
	badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
	subjectText: { fontSize: 14, fontWeight: '800' },
	wbMetaText: { fontSize: 11, fontWeight: '700' },
	locationText: { fontSize: 11, fontWeight: '600' },
	linkedPill: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
	linkedPillText: { fontSize: 10, fontWeight: '800' },
});
