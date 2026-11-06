/** @format */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createCalendarItem, deleteCalendarItem, type StudioCalendarEvent, type StudioDossierSummary, updateCalendarItem } from '../api';
import { type MobileThemePalette } from '../theme';

interface CalendarEventModalProps {
	visible: boolean;
	mode: 'view' | 'create';
	event: StudioCalendarEvent | null;
	dossiers: StudioDossierSummary[];
	defaultDossierId?: string;
	defaultProjectId?: string;
	defaultType?: 'afspraak' | 'werkbon' | 'call' | 'taak';
	userId: string;
	domain: string;
	theme: MobileThemePalette;
	onClose: () => void;
	onSaved: (event: StudioCalendarEvent) => void;
	onDeleted?: (eventId: string) => void;
	onOpenDossier?: (dossierId: string) => void;
}

const EVENT_TYPES: Array<{ id: 'afspraak' | 'werkbon' | 'call' | 'taak'; label: string }> = [
	{ id: 'afspraak', label: 'Afspraak' },
	{ id: 'werkbon', label: 'Werkbon' },
	{ id: 'call', label: 'Call' },
	{ id: 'taak', label: 'Taak' },
];

const WERKBON_STATUSES = ['Ingepland', 'In Uitvoering', 'Wacht op Onderdelen', 'Afgerond'];

export function CalendarEventModal({
	visible,
	mode,
	event,
	dossiers,
	defaultDossierId,
	defaultProjectId,
	defaultType = 'afspraak',
	userId,
	domain,
	theme,
	onClose,
	onSaved,
	onDeleted,
	onOpenDossier,
}: CalendarEventModalProps) {
	const [subject, setSubject] = useState('');
	const [eventType, setEventType] = useState<'afspraak' | 'werkbon' | 'call' | 'taak'>(defaultType);
	const [location, setLocation] = useState('');
	const [bodyText, setBodyText] = useState('');
	const [dateStr, setDateStr] = useState('');
	const [startTimeStr, setStartTimeStr] = useState('08:30');
	const [endTimeStr, setEndTimeStr] = useState('10:00');
	const [isCompleted, setIsCompleted] = useState(false);
	const [completionFeedback, setCompletionFeedback] = useState('');
	const [selectedDossierId, setSelectedDossierId] = useState<string>('');
	const [selectedProjectId, setSelectedProjectId] = useState<string>('');
	const [dossierSearch, setDossierSearch] = useState('');
	const [showDossierPicker, setShowDossierPicker] = useState(false);

	// Werkbon fields
	const [wbCode, setWbCode] = useState('');
	const [wbStatus, setWbStatus] = useState('Ingepland');
	const [wbHours, setWbHours] = useState('0');
	const [wbMaterials, setWbMaterials] = useState('');
	const [wbNotes, setWbNotes] = useState('');

	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	useEffect(() => {
		setErrorMsg(null);
		if (mode === 'view' && event) {
			setSubject(event.subject || '');
			const rawType = (event.eventType || (event.werkbon?.isWerkbon ? 'werkbon' : 'afspraak')).toLowerCase();
			setEventType(rawType === 'werkbon' || rawType === 'call' || rawType === 'taak' ? (rawType as any) : 'afspraak');
			setLocation(event.location || '');
			setBodyText(event.bodyText || event.bodyPreview || '');

			const start = new Date(event.startAt || Date.now());
			const end = new Date(event.endAt || start.getTime() + 3600000);
			setDateStr(start.toISOString().slice(0, 10));
			setStartTimeStr(`${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`);
			setEndTimeStr(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`);

			setIsCompleted(Boolean(event.isCompleted));
			setCompletionFeedback(event.completionFeedback || '');

			const firstLink = event.linkedTargets?.[0];
			setSelectedDossierId(firstLink?.dossierId || defaultDossierId || '');
			setSelectedProjectId(firstLink?.projectId || defaultProjectId || '');

			setWbCode(event.werkbon?.code || '');
			setWbStatus(event.werkbon?.status || 'Ingepland');
			setWbHours(String(event.werkbon?.workedHours ?? 0));
			setWbMaterials(event.werkbon?.materials || '');
			setWbNotes(event.werkbon?.notes || '');
		} else {
			const now = new Date();
			setSubject('');
			setEventType(defaultType);
			setLocation('');
			setBodyText('');
			setDateStr(now.toISOString().slice(0, 10));
			setStartTimeStr('08:30');
			setEndTimeStr('10:00');
			setIsCompleted(false);
			setCompletionFeedback('');
			setSelectedDossierId(defaultDossierId || '');
			setSelectedProjectId(defaultProjectId || '');
			setWbCode('');
			setWbStatus('Ingepland');
			setWbHours('0');
			setWbMaterials('');
			setWbNotes('');
		}
	}, [visible, mode, event, defaultDossierId, defaultProjectId, defaultType]);

	const selectedDossier = useMemo(() => dossiers.find((d) => d.id === selectedDossierId), [dossiers, selectedDossierId]);

	const filteredDossiers = useMemo(() => {
		const q = dossierSearch.trim().toLowerCase();
		if (!q) return dossiers.slice(0, 20);
		return dossiers
			.filter((d) => d.name.toLowerCase().includes(q) || d.dossierCode.toLowerCase().includes(q) || (d.clientName || '').toLowerCase().includes(q) || (d.address || '').toLowerCase().includes(q))
			.slice(0, 20);
	}, [dossiers, dossierSearch]);

	const buildStartEndIso = () => {
		const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim()) ? dateStr.trim() : new Date().toISOString().slice(0, 10);
		const cleanStart = /^\d{1,2}:\d{2}$/.test(startTimeStr.trim()) ? startTimeStr.trim().padStart(5, '0') : '08:30';
		const cleanEnd = /^\d{1,2}:\d{2}$/.test(endTimeStr.trim()) ? endTimeStr.trim().padStart(5, '0') : '10:00';
		const startAt = new Date(`${cleanDate}T${cleanStart}:00`);
		const endAt = new Date(`${cleanDate}T${cleanEnd}:00`);
		if (isNaN(startAt.getTime())) {
			const now = new Date();
			return { startAt: now.toISOString(), endAt: new Date(now.getTime() + 3600000).toISOString() };
		}
		if (isNaN(endAt.getTime()) || endAt <= startAt) {
			return { startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + 3600000).toISOString() };
		}
		return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
	};

	const handleSave = async () => {
		if (!subject.trim()) {
			setErrorMsg('Voer een onderwerp of titel in.');
			return;
		}
		setSaving(true);
		setErrorMsg(null);

		try {
			const { startAt, endAt } = buildStartEndIso();
			const isWerkbon = eventType === 'werkbon';
			const werkbonPayload = isWerkbon
				? {
						isWerkbon: true,
						code: wbCode.trim() || undefined,
						status: wbStatus,
						workedHours: Number(wbHours.replace(',', '.')) || 0,
						materials: wbMaterials.trim(),
						notes: wbNotes.trim(),
					}
				: undefined;

			let saved: StudioCalendarEvent;
			if (mode === 'view' && event?.id) {
				saved = await updateCalendarItem(
					{
						eventId: event.id,
						graphEventId: event.graphEventId,
						userId,
						subject: subject.trim(),
						eventType,
						location: location.trim(),
						bodyText: bodyText.trim(),
						startAt,
						endAt,
						isCompleted,
						completionFeedback: completionFeedback.trim(),
						werkbon: werkbonPayload,
						eventSnapshot: event,
					},
					domain
				);
				if (selectedDossierId && !event.linkedTargets?.some((t) => t.dossierId === selectedDossierId)) {
					saved = await updateCalendarItem(
						{
							eventId: event.id,
							graphEventId: event.graphEventId,
							userId,
							action: 'addLink',
							dossierId: selectedDossierId,
							projectId: selectedProjectId || undefined,
							eventSnapshot: saved || event,
						},
						domain
					);
				}
			} else {
				saved = await createCalendarItem(
					{
						userId,
						subject: subject.trim(),
						eventType,
						location: location.trim(),
						bodyText: bodyText.trim(),
						startAt,
						endAt,
						hasSpecificTime: true,
						isAllDay: false,
						dossierId: selectedDossierId || undefined,
						projectId: selectedProjectId || undefined,
						isWerkbon,
						werkbon: werkbonPayload,
					},
					domain
				);
			}

			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			onSaved(saved);
			onClose();
		} catch (err: any) {
			setErrorMsg(err?.message || 'Opslaan mislukt.');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!event?.id) return;
		setDeleting(true);
		setErrorMsg(null);
		try {
			await deleteCalendarItem(event.id, event.graphEventId, userId, domain);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			onDeleted?.(event.id);
			onClose();
		} catch (err: any) {
			setErrorMsg(err?.message || 'Verwijderen mislukt.');
		} finally {
			setDeleting(false);
		}
	};

	const handleOpenMaps = () => {
		const loc = location.trim();
		if (!loc) return;
		const encoded = encodeURIComponent(loc);
		const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
		void Linking.openURL(url).catch(() => {});
	};

	return (
		<Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
			<View style={styles.backdrop}>
				<View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
					{/* Sheet Header */}
					<View style={[styles.header, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
						<View style={{ flex: 1 }}>
							<Text style={[styles.overline, { color: theme.accent }]}>{mode === 'create' ? 'NIEUW AGENDA-ITEM / WERKBON' : 'BEWERK AGENDA-ITEM / WERKBON'}</Text>
							<Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
								{mode === 'create' ? 'Inplannen of Registreren' : event?.subject || 'Details'}
							</Text>
						</View>
						<TouchableOpacity activeOpacity={0.8} onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
							<Text style={[styles.closeBtnText, { color: theme.text }]}>Sluiten ✕</Text>
						</TouchableOpacity>
					</View>

					<ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
						{errorMsg && (
							<View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.14)', borderColor: theme.accentRed }]}>
								<Text style={[styles.errorText, { color: theme.accentRed }]}>{errorMsg}</Text>
							</View>
						)}

						{/* Event Type Selector */}
						<View style={styles.typeRow}>
							{EVENT_TYPES.map((t) => {
								const active = eventType === t.id;
								return (
									<TouchableOpacity
										key={t.id}
										activeOpacity={0.8}
										onPress={() => setEventType(t.id)}
										style={[
											styles.typePill,
											{
												backgroundColor: active ? theme.accent : theme.card,
												borderColor: active ? theme.accent : theme.border,
											},
										]}
									>
										<Text style={[styles.typePillText, { color: active ? '#090b09' : theme.text }]}>{t.label}</Text>
									</TouchableOpacity>
								);
							})}
						</View>

						{/* Quick Completion Toggle (in view mode or task/call/werkbon) */}
						<View style={[styles.card, { backgroundColor: theme.card, borderColor: isCompleted ? theme.accentGreen : theme.border }]}>
							<View style={styles.switchRow}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.fieldTitle, { color: isCompleted ? theme.accentGreen : theme.text }]}>{isCompleted ? '✓ Afgerond / Uitgevoerd' : 'Markeer als Afgerond'}</Text>
									<Text style={[styles.fieldSub, { color: theme.textMuted }]}>Kruis af en log direct opvolgingsfeedback op de tijdlijn</Text>
								</View>
								<Switch value={isCompleted} onValueChange={setIsCompleted} trackColor={{ false: theme.border, true: theme.accentGreen }} />
							</View>

							{isCompleted && (
								<TextInput
									value={completionFeedback}
									onChangeText={setCompletionFeedback}
									placeholder="Wat is er uitgevoerd of besproken? (verschijnt in Dossier Tijdlijn)"
									placeholderTextColor={theme.textMuted}
									multiline
									style={[styles.input, styles.textAreaSmall, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
								/>
							)}
						</View>

						{/* Core Details */}
						<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
							<Text style={[styles.label, { color: theme.textMuted }]}>ONDERWERP / TITEL</Text>
							<TextInput
								value={subject}
								onChangeText={setSubject}
								placeholder="Bijv. Opmeting / Interventie Duotecno / Werfvergadering"
								placeholderTextColor={theme.textMuted}
								style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
							/>

							<View style={styles.dateRow}>
								<View style={{ flex: 1.3 }}>
									<Text style={[styles.label, { color: theme.textMuted }]}>DATUM (JJJJ-MM-DD)</Text>
									<TextInput
										value={dateStr}
										onChangeText={setDateStr}
										placeholder="2026-11-06"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.label, { color: theme.textMuted }]}>START</Text>
									<TextInput
										value={startTimeStr}
										onChangeText={setStartTimeStr}
										placeholder="08:30"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.label, { color: theme.textMuted }]}>EINDE</Text>
									<TextInput
										value={endTimeStr}
										onChangeText={setEndTimeStr}
										placeholder="10:00"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
									/>
								</View>
							</View>

							<View style={styles.locationHeader}>
								<Text style={[styles.label, { color: theme.textMuted }]}>LOCATIE / WERFADRES</Text>
								{Boolean(location.trim()) && (
									<TouchableOpacity activeOpacity={0.8} onPress={handleOpenMaps}>
										<Text style={[styles.mapLinkText, { color: theme.accent }]}>📍 Open in Kaarten →</Text>
									</TouchableOpacity>
								)}
							</View>
							<TextInput
								value={location}
								onChangeText={setLocation}
								placeholder="Straat, nr, gemeente"
								placeholderTextColor={theme.textMuted}
								style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
							/>

							<Text style={[styles.label, { color: theme.textMuted }]}>OMSCHRIJVING & NOTITIES</Text>
							<TextInput
								value={bodyText}
								onChangeText={setBodyText}
								placeholder="Extra werfinstructies, contactpersoon, benodigd materiaal..."
								placeholderTextColor={theme.textMuted}
								multiline
								style={[styles.input, styles.textArea, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
							/>
						</View>

						{/* Werkbon On-Site Fields */}
						{eventType === 'werkbon' && (
							<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.accentBorder }]}>
								<Text style={[styles.overline, { color: theme.accent }]}>CAFCA WERKBON REGISTRATIE</Text>

								<View style={styles.statusPillsRow}>
									{WERKBON_STATUSES.map((st) => {
										const active = wbStatus === st;
										return (
											<TouchableOpacity
												key={st}
												activeOpacity={0.8}
												onPress={() => setWbStatus(st)}
												style={[
													styles.statusChip,
													{
														backgroundColor: active ? theme.accentSoft : theme.recessed,
														borderColor: active ? theme.accent : theme.border,
													},
												]}
											>
												<Text style={[styles.statusChipText, { color: active ? theme.accent : theme.textMuted }]}>{st}</Text>
											</TouchableOpacity>
										);
									})}
								</View>

								<View style={styles.dateRow}>
									<View style={{ flex: 1 }}>
										<Text style={[styles.label, { color: theme.textMuted }]}>WERKBON CODE</Text>
										<TextInput
											value={wbCode}
											onChangeText={setWbCode}
											placeholder="WB-2026..."
											placeholderTextColor={theme.textMuted}
											style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
										/>
									</View>
									<View style={{ flex: 1 }}>
										<Text style={[styles.label, { color: theme.textMuted }]}>GEPRESTEERDE UREN</Text>
										<TextInput
											value={wbHours}
											onChangeText={setWbHours}
											keyboardType="numeric"
											placeholder="2.5"
											placeholderTextColor={theme.textMuted}
											style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
										/>
									</View>
								</View>

								<Text style={[styles.label, { color: theme.textMuted }]}>GEBRUIKTE MATERIALEN OP DE WERF</Text>
								<TextInput
									value={wbMaterials}
									onChangeText={setWbMaterials}
									placeholder="Bijv. 1x DT00-24SW, 2x DT1C-4B, 15m EIB buskabel..."
									placeholderTextColor={theme.textMuted}
									multiline
									style={[styles.input, styles.textAreaSmall, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
								/>

								<Text style={[styles.label, { color: theme.textMuted }]}>TECHNIEKER OPMERKINGEN</Text>
								<TextInput
									value={wbNotes}
									onChangeText={setWbNotes}
									placeholder="Opmerkingen voor facturatie of opvolging..."
									placeholderTextColor={theme.textMuted}
									multiline
									style={[styles.input, styles.textAreaSmall, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
								/>
							</View>
						)}

						{/* Linked Dossier Selector */}
						<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
							<View style={styles.locationHeader}>
								<Text style={[styles.label, { color: theme.textMuted }]}>GEKOPPELD DOSSIER & PROJECT</Text>
								{selectedDossier && onOpenDossier && (
									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => {
											onClose();
											onOpenDossier(selectedDossier.id);
										}}
									>
										<Text style={[styles.mapLinkText, { color: theme.accent }]}>Open Dossier →</Text>
									</TouchableOpacity>
								)}
							</View>

							<TouchableOpacity
								activeOpacity={0.8}
								onPress={() => setShowDossierPicker((v) => !v)}
								style={[styles.selectorBtn, { backgroundColor: theme.recessed, borderColor: selectedDossier ? theme.accentBorder : theme.border }]}
							>
								<Text style={[styles.selectorBtnText, { color: selectedDossier ? theme.accent : theme.textMuted }]}>
									{selectedDossier ? `${selectedDossier.dossierCode} · ${selectedDossier.name}` : 'Kies een Dossier om te koppelen...'}
								</Text>
								<Text style={{ color: theme.textMuted }}>{showDossierPicker ? '▲' : '▼'}</Text>
							</TouchableOpacity>

							{showDossierPicker && (
								<View style={[styles.pickerDropdown, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
									<TextInput
										value={dossierSearch}
										onChangeText={setDossierSearch}
										placeholder="Zoek op D-nummer, klant of adres..."
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
									/>
									{filteredDossiers.map((d) => {
										const isChosen = d.id === selectedDossierId;
										return (
											<TouchableOpacity
												key={d.id}
												activeOpacity={0.8}
												onPress={() => {
													setSelectedDossierId(d.id);
													setSelectedProjectId(d.projects?.[0]?.id || '');
													if (!location.trim() && d.address) {
														setLocation(d.address);
													}
													setShowDossierPicker(false);
												}}
												style={[
													styles.pickerOption,
													{
														backgroundColor: isChosen ? theme.accentSoft : 'transparent',
														borderBottomColor: theme.border,
													},
												]}
											>
												<Text style={[styles.pickerCode, { color: theme.accent }]}>{d.dossierCode}</Text>
												<Text style={[styles.pickerName, { color: theme.text }]} numberOfLines={1}>
													{d.name} {d.address ? `• ${d.address}` : ''}
												</Text>
											</TouchableOpacity>
										);
									})}
								</View>
							)}
						</View>

						{/* Action Buttons */}
						<View style={styles.actionsFooter}>
							<TouchableOpacity activeOpacity={0.85} onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
								{saving ? (
									<ActivityIndicator size="small" color="#090b09" />
								) : (
									<Text style={styles.saveBtnText}>{mode === 'create' ? 'Opslaan & Inplannen' : 'Wijzigingen Opslaan'}</Text>
								)}
							</TouchableOpacity>

							{mode === 'view' && event?.id && (
								<TouchableOpacity
									activeOpacity={0.8}
									onPress={handleDelete}
									disabled={deleting}
									style={[styles.deleteBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: theme.accentRed }]}
								>
									{deleting ? <ActivityIndicator size="small" color={theme.accentRed} /> : <Text style={[styles.deleteBtnText, { color: theme.accentRed }]}>Verwijderen</Text>}
								</TouchableOpacity>
							)}
						</View>
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.65)',
		justifyContent: 'flex-end',
	},
	sheet: {
		height: '90%',
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: 1,
		overflow: 'hidden',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 18,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	overline: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 1.1,
	},
	headerTitle: {
		fontSize: 17,
		fontWeight: '800',
		marginTop: 2,
	},
	closeBtn: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		borderWidth: 1,
	},
	closeBtnText: {
		fontSize: 12,
		fontWeight: '800',
	},
	scrollContent: {
		padding: 16,
		gap: 12,
		paddingBottom: 36,
	},
	errorBanner: {
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
	},
	errorText: {
		fontSize: 12,
		fontWeight: '700',
	},
	typeRow: {
		flexDirection: 'row',
		gap: 8,
	},
	typePill: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 16,
		borderWidth: 1,
		alignItems: 'center',
	},
	typePillText: {
		fontSize: 12,
		fontWeight: '800',
	},
	card: {
		borderRadius: 22,
		borderWidth: 1,
		padding: 16,
		gap: 10,
	},
	switchRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 10,
	},
	fieldTitle: {
		fontSize: 14,
		fontWeight: '800',
	},
	fieldSub: {
		fontSize: 11,
		marginTop: 2,
	},
	label: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 0.9,
	},
	input: {
		borderRadius: 14,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 13,
	},
	textAreaSmall: {
		minHeight: 62,
	},
	textArea: {
		minHeight: 84,
	},
	dateRow: {
		flexDirection: 'row',
		gap: 8,
	},
	locationHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	mapLinkText: {
		fontSize: 11,
		fontWeight: '800',
	},
	statusPillsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
	},
	statusChip: {
		paddingHorizontal: 11,
		paddingVertical: 7,
		borderRadius: 14,
		borderWidth: 1,
	},
	statusChipText: {
		fontSize: 11,
		fontWeight: '800',
	},
	selectorBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderRadius: 14,
		borderWidth: 1,
	},
	selectorBtnText: {
		fontSize: 13,
		fontWeight: '700',
		flex: 1,
	},
	pickerDropdown: {
		borderRadius: 16,
		borderWidth: 1,
		padding: 10,
		gap: 6,
	},
	pickerOption: {
		paddingVertical: 9,
		paddingHorizontal: 8,
		borderBottomWidth: 1,
		borderRadius: 10,
	},
	pickerCode: {
		fontSize: 11,
		fontWeight: '800',
	},
	pickerName: {
		fontSize: 12,
		fontWeight: '600',
	},
	actionsFooter: {
		gap: 10,
		marginTop: 4,
	},
	saveBtn: {
		paddingVertical: 14,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	saveBtnText: {
		color: '#090b09',
		fontSize: 14,
		fontWeight: '900',
	},
	deleteBtn: {
		paddingVertical: 12,
		borderRadius: 18,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	deleteBtnText: {
		fontSize: 13,
		fontWeight: '800',
	},
});
