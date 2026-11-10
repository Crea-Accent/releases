/** @format */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
	createDossierOrSubproject,
	fetchAllDossiers,
	fetchDossierDetail,
	logDossierTimelineUpdate,
	sendStudioEmail,
	type StudioDossierDetail,
	type StudioDossierSummary,
	type StudioTimelineEvent,
} from '../api';
import { CalendarEventModal } from '../components/CalendarEventModal';
import { type MobileMetadata } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface DossiersScreenProps {
	metadata: MobileMetadata;
	theme: MobileThemePalette;
	selectedDossierId?: string | null;
	onSelectDossierId: (dossierId: string | null) => void;
}

type DossierListFilter = 'all' | 'werkbon' | 'offerte' | 'duotecno' | 'trikker';
type DossierDetailTab = 'timeline' | 'werkbonnen' | 'mail' | 'files';

const TIMELINE_CATEGORIES: Array<{ id: 'change' | 'note' | 'werkbon' | 'duotecno' | 'schema' | 'offerte'; label: string }> = [
	{ id: 'change', label: 'Wijziging op Werf' },
	{ id: 'note', label: 'Veldnotitie' },
	{ id: 'duotecno', label: 'Duotecno / Canbus' },
	{ id: 'schema', label: 'Trikker / Schema' },
	{ id: 'werkbon', label: 'Werkbon Opmerking' },
	{ id: 'offerte', label: 'Meerwerk / Offerte' },
];

const PROJECT_STATUSES = ['', 'Offerte', 'In Voorbereiding', 'In Uitvoering', 'Wacht op Klant', 'Opgeleverd'];

export function DossiersScreen({ metadata, theme, selectedDossierId, onSelectDossierId }: DossiersScreenProps) {
	const [loadingList, setLoadingList] = useState(true);
	const [refreshingList, setRefreshingList] = useState(false);
	const [dossiers, setDossiers] = useState<StudioDossierSummary[]>([]);
	const [search, setSearch] = useState('');
	const [listFilter, setListFilter] = useState<DossierListFilter>('all');

	// Detail state
	const [loadingDetail, setLoadingDetail] = useState(false);
	const [detail, setDetail] = useState<StudioDossierDetail | null>(null);
	const [activeProjectId, setActiveProjectId] = useState<string>('all');
	const [detailTab, setDetailTab] = useState<DossierDetailTab>('timeline');

	// Modals
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [createMode, setCreateMode] = useState<'dossier' | 'project'>('dossier');
	const [newName, setNewName] = useState('');
	const [newClient, setNewClient] = useState('');
	const [newAddress, setNewAddress] = useState('');
	const [newDiscipline, setNewDiscipline] = useState('elektriciteit');
	const [newDesc, setNewDesc] = useState('');
	const [creatingSaving, setCreatingSaving] = useState(false);

	// Log Change / Field Note modal
	const [logModalOpen, setLogModalOpen] = useState(false);
	const [logCategory, setLogCategory] = useState<'change' | 'note' | 'werkbon' | 'duotecno' | 'schema' | 'offerte'>('change');
	const [logTitle, setLogTitle] = useState('');
	const [logDesc, setLogDesc] = useState('');
	const [logStatus, setLogStatus] = useState('');
	const [logSaving, setLogSaving] = useState(false);

	// Schedule Werkbon / Afspraak modal for this Dossier
	const [calendarModalOpen, setCalendarModalOpen] = useState(false);

	// Send Project Mail modal
	const [mailModalOpen, setMailModalOpen] = useState(false);
	const [mailTo, setMailTo] = useState('');
	const [mailSubject, setMailSubject] = useState('');
	const [mailBody, setMailBody] = useState('');
	const [mailSending, setMailSending] = useState(false);

	const loadList = useCallback(async () => {
		try {
			const list = await fetchAllDossiers(metadata.domain);
			setDossiers(list);
		} catch {
			// Keep cached list
		} finally {
			setLoadingList(false);
			setRefreshingList(false);
		}
	}, [metadata.domain]);

	useEffect(() => {
		void loadList();
	}, [loadList]);

	const loadDetail = useCallback(
		async (dId: string) => {
			setLoadingDetail(true);
			try {
				const d = await fetchDossierDetail(dId, metadata.activeUserId, metadata.domain);
				setDetail(d);
				setActiveProjectId('all');
			} catch {
				// Fallback to summary if detail fails
			} finally {
				setLoadingDetail(false);
			}
		},
		[metadata.activeUserId, metadata.domain]
	);

	useEffect(() => {
		if (selectedDossierId) {
			void loadDetail(selectedDossierId);
		} else {
			setDetail(null);
		}
	}, [selectedDossierId, loadDetail]);

	const filteredDossiers = useMemo(() => {
		const q = search.trim().toLowerCase();
		return dossiers.filter((d) => {
			if (listFilter === 'werkbon' && !(d.werkbonnen && d.werkbonnen.length > 0)) return false;
			if (listFilter === 'offerte' && !(d.offertes && d.offertes.length > 0)) return false;
			if (listFilter === 'duotecno' && !(d.projects || []).some((p) => p.hasCanbus || p.duotecnoVersion)) return false;
			if (listFilter === 'trikker' && !(d.projects || []).some((p) => p.hasTrikker)) return false;

			if (!q) return true;
			const projMatch = (d.projects || []).some((p) => (p.name || '').toLowerCase().includes(q) || (p.discipline || '').toLowerCase().includes(q));
			return (
				(d.name || '').toLowerCase().includes(q) ||
				(d.dossierCode || '').toLowerCase().includes(q) ||
				(d.clientName || '').toLowerCase().includes(q) ||
				(d.address || '').toLowerCase().includes(q) ||
				projMatch
			);
		});
	}, [dossiers, listFilter, search]);

	const activeTimeline = useMemo((): StudioTimelineEvent[] => {
		if (!detail) return [];
		if (activeProjectId !== 'all' && detail.projectTimelines?.[activeProjectId]) {
			return detail.projectTimelines[activeProjectId];
		}
		return detail.masterTimeline || [];
	}, [detail, activeProjectId]);

	const fileEvents = useMemo(() => {
		return activeTimeline.filter((ev) => ['schema', 'duotecno', 'offerte', 'file'].includes(ev.category));
	}, [activeTimeline]);

	const handleCreateDossierOrProject = async () => {
		if (!newName.trim()) return;
		setCreatingSaving(true);
		try {
			const res = await createDossierOrSubproject(
				{
					mode: createMode,
					dossierId: createMode === 'project' ? detail?.dossier?.id : undefined,
					dossierCode: createMode === 'project' ? detail?.dossier?.dossierCode : undefined,
					name: newName.trim(),
					clientName: newClient.trim() || newName.trim(),
					address: newAddress.trim(),
					discipline: newDiscipline,
					description: newDesc.trim(),
					actorName: metadata.activeUserName,
					actorEmail: metadata.activeUserEmail,
				},
				metadata.domain
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			setCreateModalOpen(false);
			setNewName('');
			setNewClient('');
			setNewAddress('');
			setNewDesc('');
			await loadList();
			if (createMode === 'project' && detail?.dossier?.id) {
				await loadDetail(detail.dossier.id);
			} else if (res?.dossier?.id) {
				onSelectDossierId(res.dossier.id);
			}
		} catch {
		} finally {
			setCreatingSaving(false);
		}
	};

	const handleLogTimelineUpdate = async () => {
		if (!detail?.dossier?.id || !logTitle.trim()) return;
		setLogSaving(true);
		try {
			const createdEvent = await logDossierTimelineUpdate(
				detail.dossier.id,
				{
					projectId: activeProjectId !== 'all' ? activeProjectId : detail.projects?.[0]?.id,
					category: logCategory,
					title: logTitle.trim(),
					description: logDesc.trim(),
					newStatus: logStatus || undefined,
					actorName: metadata.activeUserName,
					actorEmail: metadata.activeUserEmail,
				},
				metadata.domain
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			setDetail((prev) =>
				prev
					? {
							...prev,
							masterTimeline: [createdEvent, ...(prev.masterTimeline || [])],
						}
					: prev
			);
			setLogModalOpen(false);
			setLogTitle('');
			setLogDesc('');
			setLogStatus('');
		} catch {
		} finally {
			setLogSaving(false);
		}
	};

	const handleSendProjectMail = async () => {
		if (!detail?.dossier?.id || !mailTo.trim() || !mailSubject.trim()) return;
		setMailSending(true);
		try {
			await sendStudioEmail(
				{
					userId: metadata.activeUserId,
					to: mailTo.trim(),
					subject: mailSubject.trim(),
					bodyText: mailBody.trim(),
					dossierId: detail.dossier.id,
					projectId: activeProjectId !== 'all' ? activeProjectId : detail.projects?.[0]?.id,
					projectName: detail.dossier.name,
				},
				metadata.domain
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			setMailModalOpen(false);
			setMailSubject('');
			setMailBody('');
			await loadDetail(detail.dossier.id);
		} catch {
		} finally {
			setMailSending(false);
		}
	};

	const openAddressInMaps = (addr: string) => {
		const encoded = encodeURIComponent(addr);
		const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
		void Linking.openURL(url).catch(() => {});
	};

	// --- RENDER DOSSIER DETAIL WORKSPACE ---
	if (selectedDossierId) {
		const d = detail?.dossier || dossiers.find((item) => item.id === selectedDossierId);
		return (
			<View style={[styles.container, { backgroundColor: theme.background }]}>
				{/* Top Bar */}
				<View style={[styles.detailTopBar, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
					<TouchableOpacity activeOpacity={0.8} onPress={() => onSelectDossierId(null)} style={[styles.backBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.backBtnText, { color: theme.text }]}>← Dossiers</Text>
					</TouchableOpacity>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: theme.accent }]}>{d?.dossierCode || 'DOSSIER WORKSPACE'}</Text>
						<Text style={[styles.detailHeaderTitle, { color: theme.text }]} numberOfLines={1}>
							{d?.name || 'Laden...'}
						</Text>
					</View>
					<TouchableOpacity activeOpacity={0.85} onPress={() => setLogModalOpen(true)} style={[styles.primarySmallBtn, { backgroundColor: theme.accent }]}>
						<Text style={styles.primarySmallBtnText}>+ Wijziging</Text>
					</TouchableOpacity>
				</View>

				{loadingDetail && !detail ? (
					<View style={styles.centerBox}>
						<ActivityIndicator size="large" color={theme.accent} />
						<Text style={[styles.loaderText, { color: theme.textMuted }]}>Dossier, tijdlijn & NAS-projecten laden...</Text>
					</View>
				) : (
					<ScrollView
						contentContainerStyle={styles.detailScrollContent}
						refreshControl={<RefreshControl refreshing={loadingDetail} onRefresh={() => void loadDetail(selectedDossierId)} tintColor={theme.accent} />}
					>
						{/* Dossier Summary & Quick Actions Card */}
						<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
							<View style={styles.dossierMetaRow}>
								<View style={[styles.codeBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
									<Text style={[styles.codeBadgeText, { color: theme.accent }]}>{d?.dossierCode || 'DOSSIER'}</Text>
								</View>
								{Boolean(d?.status) && (
									<View style={[styles.statusBadge, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
										<Text style={[styles.statusBadgeText, { color: theme.textMuted }]}>{d?.status}</Text>
									</View>
								)}
							</View>

							<Text style={[styles.dossierBigTitle, { color: theme.text }]}>{d?.name}</Text>

							{Boolean(d?.address) && (
								<TouchableOpacity activeOpacity={0.8} onPress={() => openAddressInMaps(d!.address!)}>
									<Text style={[styles.addressLink, { color: theme.accent }]}>📍 {d?.address} (Open Route →)</Text>
								</TouchableOpacity>
							)}

							{Boolean(d?.contactEmails?.length) && <Text style={[styles.contactText, { color: theme.textMuted }]}>✉ {d?.contactEmails?.join(' • ')}</Text>}

							{/* On-The-Go Action Row */}
							<View style={styles.actionRow}>
								<TouchableOpacity activeOpacity={0.85} onPress={() => setLogModalOpen(true)} style={[styles.actionBtnPrimary, { backgroundColor: theme.accent }]}>
									<Text style={styles.actionBtnPrimaryText}>+ Veldnotitie / Status</Text>
								</TouchableOpacity>

								<TouchableOpacity
									activeOpacity={0.85}
									onPress={() => setCalendarModalOpen(true)}
									style={[styles.actionBtnSecondary, { backgroundColor: theme.recessed, borderColor: theme.border }]}
								>
									<Text style={[styles.actionBtnSecondaryText, { color: theme.text }]}>+ Werkbon / Plan</Text>
								</TouchableOpacity>

								<TouchableOpacity
									activeOpacity={0.85}
									onPress={() => {
										setMailTo(d?.contactEmails?.[0] || '');
										setMailSubject(`[${d?.dossierCode || 'Dossier'}] ${d?.name || ''}`);
										setMailModalOpen(true);
									}}
									style={[styles.actionBtnSecondary, { backgroundColor: theme.recessed, borderColor: theme.border }]}
								>
									<Text style={[styles.actionBtnSecondaryText, { color: theme.text }]}>✉ Mail</Text>
								</TouchableOpacity>
							</View>
						</View>

						{/* Subprojects Bar */}
						{Boolean(detail?.projects?.length) && (
							<View style={styles.subprojectsSection}>
								<View style={styles.subHeaderRow}>
									<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>SUBPROJECTEN ({detail!.projects.length})</Text>
									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => {
											setCreateMode('project');
											setCreateModalOpen(true);
										}}
									>
										<Text style={[styles.addLinkText, { color: theme.accent }]}>+ Subproject Toevoegen</Text>
									</TouchableOpacity>
								</View>

								<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => setActiveProjectId('all')}
										style={[
											styles.subPill,
											{
												backgroundColor: activeProjectId === 'all' ? theme.accentSoft : theme.card,
												borderColor: activeProjectId === 'all' ? theme.accentBorder : theme.border,
											},
										]}
									>
										<Text style={[styles.subPillTitle, { color: activeProjectId === 'all' ? theme.accent : theme.text }]}>Alle Subprojecten</Text>
									</TouchableOpacity>

									{detail!.projects.map((p) => {
										const active = activeProjectId === p.id;
										return (
											<TouchableOpacity
												key={p.id}
												activeOpacity={0.8}
												onPress={() => setActiveProjectId(p.id)}
												style={[
													styles.subPill,
													{
														backgroundColor: active ? theme.accentSoft : theme.card,
														borderColor: active ? theme.accentBorder : theme.border,
													},
												]}
											>
												<Text style={[styles.subPillTitle, { color: active ? theme.accent : theme.text }]}>{p.name || p.subdossierLabel}</Text>
												<View style={styles.techBadgesRow}>
													{p.hasTrikker && <Text style={[styles.techBadge, { color: theme.accent }]}>⚡ Trikker</Text>}
													{p.hasCanbus && <Text style={[styles.techBadge, { color: theme.accentGreen }]}>🎛 Canbus</Text>}
													{Boolean(p.status) && <Text style={[styles.techBadge, { color: theme.textMuted }]}>{p.status}</Text>}
												</View>
											</TouchableOpacity>
										);
									})}
								</ScrollView>
							</View>
						)}

						{/* Workspace Sub-Tabs */}
						<View style={styles.tabsRow}>
							{[
								{ id: 'timeline' as const, label: `Tijdlijn (${activeTimeline.length})` },
								{ id: 'werkbonnen' as const, label: `Bonnen & Offertes (${(d?.werkbonnen?.length || 0) + (d?.offertes?.length || 0)})` },
								{ id: 'mail' as const, label: `Mails (${detail?.mailThreads?.length || 0})` },
								{ id: 'files' as const, label: `Schema & NAS (${fileEvents.length})` },
							].map((t) => {
								const active = detailTab === t.id;
								return (
									<TouchableOpacity
										key={t.id}
										activeOpacity={0.8}
										onPress={() => setDetailTab(t.id)}
										style={[
											styles.tabBtn,
											{
												backgroundColor: active ? theme.accent : theme.card,
												borderColor: active ? theme.accent : theme.border,
											},
										]}
									>
										<Text style={[styles.tabBtnText, { color: active ? '#090b09' : theme.textMuted }]} numberOfLines={1}>
											{t.label}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>

						{/* TAB 1: TIMELINE & CHANGES */}
						{detailTab === 'timeline' && (
							<View style={styles.timelineList}>
								{activeTimeline.length === 0 ? (
									<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
										<Text style={[styles.emptyTitle, { color: theme.text }]}>Nog geen tijdlijn-items</Text>
										<Text style={[styles.emptySub, { color: theme.textMuted }]}>Log hierboven je eerste veldnotitie, statuswijziging of werkbon.</Text>
									</View>
								) : (
									activeTimeline.slice(0, 50).map((ev) => (
										<View key={ev.id} style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
											<View style={styles.timelineHeader}>
												<View style={[styles.catBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
													<Text style={[styles.catBadgeText, { color: theme.accent }]}>{String(ev.category || 'UPDATE').toUpperCase()}</Text>
												</View>
												<Text style={[styles.timeLabel, { color: theme.textMuted }]}>
													{new Date(ev.occurredAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
												</Text>
											</View>
											<Text style={[styles.timelineTitle, { color: theme.text }]}>{ev.title}</Text>
											{Boolean(ev.description) && <Text style={[styles.timelineDesc, { color: theme.textMuted }]}>{ev.description}</Text>}
											{Boolean(ev.newStatus) && <Text style={[styles.newStatusText, { color: theme.accentGreen }]}>✓ Nieuwe status: {ev.newStatus}</Text>}
											{Boolean(ev.actorName) && (
												<Text style={[styles.actorText, { color: theme.textMuted }]}>
													Door {ev.actorName} {ev.projectName ? `• ${ev.projectName}` : ''}
												</Text>
											)}
										</View>
									))
								)}
							</View>
						)}

						{/* TAB 2: WERKBONNEN & OFFERTES */}
						{detailTab === 'werkbonnen' && (
							<View style={styles.timelineList}>
								<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
									<View style={styles.subHeaderRow}>
										<Text style={[styles.sectionTitle, { color: theme.text }]}>Werkbonnen ({d?.werkbonnen?.length || 0})</Text>
										<TouchableOpacity activeOpacity={0.8} onPress={() => setCalendarModalOpen(true)}>
											<Text style={[styles.addLinkText, { color: theme.accent }]}>+ Nieuwe Werkbon</Text>
										</TouchableOpacity>
									</View>
									{!d?.werkbonnen?.length ? (
										<Text style={[styles.emptySub, { color: theme.textMuted }]}>Geen werkbonnen gekoppeld aan dit dossier.</Text>
									) : (
										d.werkbonnen.map((wb, idx) => (
											<View key={wb.id || idx} style={[styles.subItemRow, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
												<View style={{ flex: 1 }}>
													<Text style={[styles.subItemCode, { color: theme.accent }]}>{wb.code || 'WERKBON'}</Text>
													<Text style={[styles.subItemTitle, { color: theme.text }]}>{wb.title}</Text>
												</View>
												<Text style={[styles.subItemMeta, { color: theme.textMuted }]}>{wb.status || 'Actief'}</Text>
											</View>
										))
									)}
								</View>

								<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
									<Text style={[styles.sectionTitle, { color: theme.text }]}>Offertes & Meetstaten ({d?.offertes?.length || 0})</Text>
									{!d?.offertes?.length ? (
										<Text style={[styles.emptySub, { color: theme.textMuted }]}>Geen offertes gevonden in de dossiermap.</Text>
									) : (
										d.offertes.map((off, idx) => (
											<View key={off.id || idx} style={[styles.subItemRow, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
												<View style={{ flex: 1 }}>
													<Text style={[styles.subItemCode, { color: theme.accent }]}>{off.code || 'OFFERTE'}</Text>
													<Text style={[styles.subItemTitle, { color: theme.text }]}>{off.title || off.fileName}</Text>
												</View>
												{Boolean(off.amount) && <Text style={[styles.subItemAmount, { color: theme.accentGreen }]}>€{off.amount?.toLocaleString('nl-BE')}</Text>}
											</View>
										))
									)}
								</View>
							</View>
						)}

						{/* TAB 3: PROJECT MAIL */}
						{detailTab === 'mail' && (
							<View style={styles.timelineList}>
								{!detail?.mailThreads?.length ? (
									<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
										<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen gekoppelde e-mails</Text>
										<Text style={[styles.emptySub, { color: theme.textMuted }]}>Verstuur een e-mail vanuit dit dossier of koppel een thread in de Mail-tab.</Text>
									</View>
								) : (
									detail.mailThreads.map((th) => (
										<View key={th.id} style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
											<Text style={[styles.timelineTitle, { color: theme.text }]}>{th.subject}</Text>
											<Text style={[styles.timelineDesc, { color: theme.textMuted }]}>{th.snippet}</Text>
											<Text style={[styles.actorText, { color: theme.accent }]}>
												{th.messageCount || th.messages?.length || 1} berichten • Laatste: {th.lastMessageAt ? new Date(th.lastMessageAt).toLocaleDateString('nl-BE') : ''}
											</Text>
										</View>
									))
								)}
							</View>
						)}

						{/* TAB 4: NAS FILES & SCHEMAS */}
						{detailTab === 'files' && (
							<View style={styles.timelineList}>
								{fileEvents.length === 0 ? (
									<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
										<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen bestanden geïndexeerd</Text>
										<Text style={[styles.emptySub, { color: theme.textMuted }]}>Zodra er .trik, canbus.json of documenten op de NAS staan verschijnen ze hier.</Text>
									</View>
								) : (
									fileEvents.map((fe) => (
										<View key={fe.id} style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
											<View style={styles.timelineHeader}>
												<Text style={[styles.subItemCode, { color: theme.accent }]}>{fe.category.toUpperCase()}</Text>
												<Text style={[styles.timeLabel, { color: theme.textMuted }]}>{fe.actorRole || 'NAS'}</Text>
											</View>
											<Text style={[styles.timelineTitle, { color: theme.text }]}>{fe.title}</Text>
											{Boolean(fe.description) && <Text style={[styles.timelineDesc, { color: theme.textMuted }]}>{fe.description}</Text>}
										</View>
									))
								)}
							</View>
						)}
					</ScrollView>
				)}

				{/* Modal: Log Field Change / Status Update */}
				<Modal visible={logModalOpen} animationType="slide" transparent onRequestClose={() => setLogModalOpen(false)}>
					<View style={styles.modalBackdrop}>
						<View style={[styles.modalSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
							<View style={[styles.modalHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
								<View>
									<Text style={[styles.overline, { color: theme.accent }]}>{d?.dossierCode} · ON-THE-GO LOGBOEK</Text>
									<Text style={[styles.modalTitle, { color: theme.text }]}>Wijziging of Veldnotitie Loggen</Text>
								</View>
								<TouchableOpacity activeOpacity={0.8} onPress={() => setLogModalOpen(false)} style={[styles.backBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
									<Text style={[styles.backBtnText, { color: theme.text }]}>Sluiten ✕</Text>
								</TouchableOpacity>
							</View>

							<ScrollView contentContainerStyle={styles.modalScroll}>
								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CATEGORIE</Text>
								<View style={styles.wrapRow}>
									{TIMELINE_CATEGORIES.map((cat) => {
										const active = logCategory === cat.id;
										return (
											<TouchableOpacity
												key={cat.id}
												activeOpacity={0.8}
												onPress={() => setLogCategory(cat.id)}
												style={[
													styles.chipBtn,
													{
														backgroundColor: active ? theme.accent : theme.card,
														borderColor: active ? theme.accent : theme.border,
													},
												]}
											>
												<Text style={[styles.chipBtnText, { color: active ? '#090b09' : theme.text }]}>{cat.label}</Text>
											</TouchableOpacity>
										);
									})}
								</View>

								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>KORTE TITEL VAN DE WIJZIGING</Text>
								<TextInput
									value={logTitle}
									onChangeText={setLogTitle}
									placeholder="Bijv. Extra drukknop leefruimte / Status bijgewerkt / Canbus gecontroleerd"
									placeholderTextColor={theme.textMuted}
									style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
								/>

								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>DETAILS / OPMERKINGEN OP DE WERF</Text>
								<TextInput
									value={logDesc}
									onChangeText={setLogDesc}
									placeholder="Beschrijf wat er op de werf is aangepast of afgesproken met de klant..."
									placeholderTextColor={theme.textMuted}
									multiline
									style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
								/>

								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>PROJECTSTATUS WIJZIGEN (OPTIONEEL)</Text>
								<View style={styles.wrapRow}>
									{PROJECT_STATUSES.map((st) => {
										const active = logStatus === st;
										const label = st || 'Status ongewijzigd';
										return (
											<TouchableOpacity
												key={label}
												activeOpacity={0.8}
												onPress={() => setLogStatus(st)}
												style={[
													styles.chipBtn,
													{
														backgroundColor: active ? theme.accentSoft : theme.card,
														borderColor: active ? theme.accent : theme.border,
													},
												]}
											>
												<Text style={[styles.chipBtnText, { color: active ? theme.accent : theme.textMuted }]}>{label}</Text>
											</TouchableOpacity>
										);
									})}
								</View>

								<TouchableOpacity activeOpacity={0.85} onPress={handleLogTimelineUpdate} disabled={logSaving} style={[styles.savePrimaryBtn, { backgroundColor: theme.accent }]}>
									{logSaving ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.savePrimaryBtnText}>Wijziging Opslaan in Dossier</Text>}
								</TouchableOpacity>
							</ScrollView>
						</View>
					</View>
				</Modal>

				{/* Modal: Send Project Email */}
				<Modal visible={mailModalOpen} animationType="slide" transparent onRequestClose={() => setMailModalOpen(false)}>
					<View style={styles.modalBackdrop}>
						<View style={[styles.modalSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
							<View style={[styles.modalHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
								<View>
									<Text style={[styles.overline, { color: theme.accent }]}>{d?.dossierCode} · PROJECT MAIL</Text>
									<Text style={[styles.modalTitle, { color: theme.text }]}>E-mail Sturen & Koppelen</Text>
								</View>
								<TouchableOpacity activeOpacity={0.8} onPress={() => setMailModalOpen(false)} style={[styles.backBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
									<Text style={[styles.backBtnText, { color: theme.text }]}>Sluiten ✕</Text>
								</TouchableOpacity>
							</View>

							<ScrollView contentContainerStyle={styles.modalScroll}>
								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>AAN (E-MAILADRES)</Text>
								<TextInput
									value={mailTo}
									onChangeText={setMailTo}
									placeholder="klant@voorbeeld.be"
									placeholderTextColor={theme.textMuted}
									autoCapitalize="none"
									keyboardType="email-address"
									style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
								/>

								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ONDERWERP</Text>
								<TextInput
									value={mailSubject}
									onChangeText={setMailSubject}
									placeholder="Onderwerp"
									placeholderTextColor={theme.textMuted}
									style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
								/>

								<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>BERICHT</Text>
								<TextInput
									value={mailBody}
									onChangeText={setMailBody}
									placeholder="Typ je bericht (wordt automatisch aan dit dossier gekoppeld)..."
									placeholderTextColor={theme.textMuted}
									multiline
									style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
								/>

								<TouchableOpacity activeOpacity={0.85} onPress={handleSendProjectMail} disabled={mailSending} style={[styles.savePrimaryBtn, { backgroundColor: theme.accent }]}>
									{mailSending ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.savePrimaryBtnText}>Versturen & Koppelen aan Dossier</Text>}
								</TouchableOpacity>
							</ScrollView>
						</View>
					</View>
				</Modal>

				{/* Modal: Schedule Werkbon / Afspraak pre-linked to this Dossier */}
				<CalendarEventModal
					visible={calendarModalOpen}
					mode="create"
					event={null}
					dossiers={dossiers}
					defaultDossierId={selectedDossierId}
					defaultProjectId={activeProjectId !== 'all' ? activeProjectId : detail?.projects?.[0]?.id}
					defaultType="werkbon"
					userId={metadata.activeUserId}
					domain={metadata.domain}
					theme={theme}
					onClose={() => setCalendarModalOpen(false)}
					onSaved={() => {
						void loadDetail(selectedDossierId);
					}}
				/>
			</View>
		);
	}

	// --- RENDER MASTER DOSSIERS LIST ---
	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			<View style={[styles.topHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
				<View style={styles.headerRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: theme.accent }]}>NAS & STUDIO CRM</Text>
						<Text style={[styles.title, { color: theme.text }]}>Dossiers ({filteredDossiers.length})</Text>
					</View>
					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() => {
							setCreateMode('dossier');
							setCreateModalOpen(true);
						}}
						style={[styles.primarySmallBtn, { backgroundColor: theme.accent }]}
					>
						<Text style={styles.primarySmallBtnText}>+ Nieuw Dossier</Text>
					</TouchableOpacity>
				</View>

				<TextInput
					value={search}
					onChangeText={setSearch}
					placeholder="Zoek op D-nummer, klant, adres of subproject..."
					placeholderTextColor={theme.textMuted}
					style={[styles.searchInput, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
				/>

				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
					{[
						{ id: 'all' as const, label: `Alle (${dossiers.length})` },
						{ id: 'duotecno' as const, label: '🎛 Duotecno / Canbus' },
						{ id: 'trikker' as const, label: '⚡ Trikker Schema' },
						{ id: 'werkbon' as const, label: '📋 Met Werkbon' },
						{ id: 'offerte' as const, label: '💶 Met Offerte' },
					].map((f) => {
						const active = listFilter === f.id;
						return (
							<TouchableOpacity
								key={f.id}
								activeOpacity={0.8}
								onPress={() => setListFilter(f.id)}
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
			</View>

			{loadingList ? (
				<View style={styles.centerBox}>
					<ActivityIndicator size="large" color={theme.accent} />
					<Text style={[styles.loaderText, { color: theme.textMuted }]}>Dossiers & projecten ophalen...</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={styles.listContent}
					refreshControl={
						<RefreshControl
							refreshing={refreshingList}
							onRefresh={() => {
								setRefreshingList(true);
								void loadList();
							}}
							tintColor={theme.accent}
						/>
					}
				>
					{filteredDossiers.map((d) => {
						const hasTrikker = (d.projects || []).some((p) => p.hasTrikker);
						const hasCanbus = (d.projects || []).some((p) => p.hasCanbus || p.duotecnoVersion);
						return (
							<TouchableOpacity
								key={d.id}
								activeOpacity={0.82}
								onPress={() => {
									void Haptics.selectionAsync().catch(() => {});
									onSelectDossierId(d.id);
								}}
								style={[styles.dossierCard, { backgroundColor: theme.card, borderColor: theme.border }]}
							>
								<View style={styles.dossierMetaRow}>
									<View style={[styles.codeBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
										<Text style={[styles.codeBadgeText, { color: theme.accent }]}>{d.dossierCode || 'DOSSIER'}</Text>
									</View>
									<View style={styles.badgesRight}>
										{hasTrikker && <Text style={[styles.miniTag, { color: theme.accent }]}>⚡ Trikker</Text>}
										{hasCanbus && <Text style={[styles.miniTag, { color: theme.accentGreen }]}>🎛 Duotecno</Text>}
										<Text style={[styles.miniTag, { color: theme.textMuted }]}>{(d.projects || []).length} project(en)</Text>
									</View>
								</View>

								<Text style={[styles.dossierTitle, { color: theme.text }]}>{d.name}</Text>
								{Boolean(d.address) && (
									<Text style={[styles.dossierAddress, { color: theme.textMuted }]} numberOfLines={1}>
										📍 {d.address}
									</Text>
								)}
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			)}

			{/* Modal: Create New Dossier or Subproject */}
			<Modal visible={createModalOpen} animationType="slide" transparent onRequestClose={() => setCreateModalOpen(false)}>
				<View style={styles.modalBackdrop}>
					<View style={[styles.modalSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
						<View style={[styles.modalHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
							<View>
								<Text style={[styles.overline, { color: theme.accent }]}>{createMode === 'dossier' ? 'NIEUW KLANTDOSSIER' : 'NIEUW SUBPROJECT'}</Text>
								<Text style={[styles.modalTitle, { color: theme.text }]}>{createMode === 'dossier' ? 'Dossier Aanmaken' : 'Subproject Toevoegen'}</Text>
							</View>
							<TouchableOpacity activeOpacity={0.8} onPress={() => setCreateModalOpen(false)} style={[styles.backBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
								<Text style={[styles.backBtnText, { color: theme.text }]}>Sluiten ✕</Text>
							</TouchableOpacity>
						</View>

						<ScrollView contentContainerStyle={styles.modalScroll}>
							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{createMode === 'dossier' ? 'DOSSIER / KLANTNAAM' : 'NAAM SUBPROJECT'}</Text>
							<TextInput
								value={newName}
								onChangeText={setNewName}
								placeholder={createMode === 'dossier' ? 'Familie Peeters - Villa Zoute' : 'Elektriciteit & Duotecno'}
								placeholderTextColor={theme.textMuted}
								style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							{createMode === 'dossier' && (
								<>
									<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>WERFADRES</Text>
									<TextInput
										value={newAddress}
										onChangeText={setNewAddress}
										placeholder="Kustlaan 120, 8300 Knokke-Heist"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
									/>
								</>
							)}

							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>DISCIPLINE</Text>
							<View style={styles.wrapRow}>
								{['elektriciteit', 'duotecno', 'algemeen', 'verlichting', 'hvac'].map((disc) => {
									const active = newDiscipline === disc;
									return (
										<TouchableOpacity
											key={disc}
											activeOpacity={0.8}
											onPress={() => setNewDiscipline(disc)}
											style={[
												styles.chipBtn,
												{
													backgroundColor: active ? theme.accent : theme.card,
													borderColor: active ? theme.accent : theme.border,
												},
											]}
										>
											<Text style={[styles.chipBtnText, { color: active ? '#090b09' : theme.text }]}>{disc.toUpperCase()}</Text>
										</TouchableOpacity>
									);
								})}
							</View>

							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>OMSCHRIJVING / NOTITIES</Text>
							<TextInput
								value={newDesc}
								onChangeText={setNewDesc}
								placeholder="Korte projectomschrijving..."
								placeholderTextColor={theme.textMuted}
								multiline
								style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							<TouchableOpacity activeOpacity={0.85} onPress={handleCreateDossierOrProject} disabled={creatingSaving} style={[styles.savePrimaryBtn, { backgroundColor: theme.accent }]}>
								{creatingSaving ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.savePrimaryBtnText}>Aanmaken in Studio</Text>}
							</TouchableOpacity>
						</ScrollView>
					</View>
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	topHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
	headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
	title: { fontSize: 20, fontWeight: '900' },
	primarySmallBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14 },
	primarySmallBtnText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	searchInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
	pillsRow: { flexDirection: 'row', gap: 6 },
	filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	filterPillText: { fontSize: 11, fontWeight: '800' },
	centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
	loaderText: { fontSize: 13 },
	listContent: { padding: 14, gap: 10, paddingBottom: 32 },
	dossierCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 6 },
	dossierMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	codeBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
	codeBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
	badgesRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	miniTag: { fontSize: 10, fontWeight: '800' },
	dossierTitle: { fontSize: 15, fontWeight: '800' },
	dossierAddress: { fontSize: 12 },
	detailTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, gap: 10 },
	backBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	backBtnText: { fontSize: 12, fontWeight: '800' },
	detailHeaderTitle: { fontSize: 16, fontWeight: '900' },
	detailScrollContent: { padding: 14, gap: 12, paddingBottom: 36 },
	card: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 10 },
	statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
	statusBadgeText: { fontSize: 10, fontWeight: '800' },
	dossierBigTitle: { fontSize: 19, fontWeight: '900' },
	addressLink: { fontSize: 12, fontWeight: '800' },
	contactText: { fontSize: 11 },
	actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
	actionBtnPrimary: { flex: 1.3, paddingVertical: 11, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
	actionBtnPrimaryText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	actionBtnSecondary: { flex: 1, paddingVertical: 11, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
	actionBtnSecondaryText: { fontSize: 12, fontWeight: '800' },
	subprojectsSection: { gap: 8 },
	subHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
	addLinkText: { fontSize: 11, fontWeight: '800' },
	subPill: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16, borderWidth: 1, gap: 2 },
	subPillTitle: { fontSize: 12, fontWeight: '800' },
	techBadgesRow: { flexDirection: 'row', gap: 6 },
	techBadge: { fontSize: 10, fontWeight: '700' },
	tabsRow: { flexDirection: 'row', gap: 6 },
	tabBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
	tabBtnText: { fontSize: 10, fontWeight: '800' },
	timelineList: { gap: 8 },
	timelineCard: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 5 },
	timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
	catBadgeText: { fontSize: 9, fontWeight: '800' },
	timeLabel: { fontSize: 10 },
	timelineTitle: { fontSize: 14, fontWeight: '800' },
	timelineDesc: { fontSize: 12, lineHeight: 17 },
	newStatusText: { fontSize: 11, fontWeight: '800' },
	actorText: { fontSize: 10, fontWeight: '600', marginTop: 2 },
	emptyCard: { borderRadius: 20, borderWidth: 1, padding: 22, alignItems: 'center', gap: 4 },
	emptyTitle: { fontSize: 14, fontWeight: '800' },
	emptySub: { fontSize: 12, textAlign: 'center' },
	sectionTitle: { fontSize: 15, fontWeight: '800' },
	subItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 14, borderWidth: 1, gap: 8 },
	subItemCode: { fontSize: 10, fontWeight: '800' },
	subItemTitle: { fontSize: 13, fontWeight: '700' },
	subItemMeta: { fontSize: 11, fontWeight: '700' },
	subItemAmount: { fontSize: 13, fontWeight: '900' },
	modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'flex-end' },
	modalSheet: { height: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, overflow: 'hidden' },
	modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
	modalTitle: { fontSize: 17, fontWeight: '800', marginTop: 2 },
	modalScroll: { padding: 16, gap: 12, paddingBottom: 32 },
	wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	chipBtn: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
	chipBtnText: { fontSize: 11, fontWeight: '800' },
	input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
	textArea: { minHeight: 88 },
	savePrimaryBtn: { marginTop: 8, paddingVertical: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
	savePrimaryBtnText: { color: '#090b09', fontSize: 14, fontWeight: '900' },
});
