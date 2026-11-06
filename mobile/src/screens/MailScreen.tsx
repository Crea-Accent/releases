/** @format */

import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { fetchMailboxMessages, linkMailThreadToDossier, performMailMessageAction, sendStudioEmail, type StudioDossierSummary, type StudioMailMessage } from '../api';
import { type MobileMetadata } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface MailScreenProps {
	metadata: MobileMetadata;
	theme: MobileThemePalette;
	onOpenDossier: (dossierId: string) => void;
}

type MailFolderKey = 'inbox' | 'sentitems' | 'archive' | 'deleteditems';

function stripHtmlTags(raw?: string): string {
	if (!raw) return '';
	return raw
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function MailScreen({ metadata, theme, onOpenDossier }: MailScreenProps) {
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [folder, setFolder] = useState<MailFolderKey>('inbox');
	const [search, setSearch] = useState('');
	const [messages, setMessages] = useState<StudioMailMessage[]>([]);
	const [dossiers, setDossiers] = useState<StudioDossierSummary[]>([]);
	const [connectedEmail, setConnectedEmail] = useState<string>('');

	// Thread reader modal
	const [selectedThread, setSelectedThread] = useState<StudioMailMessage | null>(null);
	const [replyText, setReplyText] = useState('');
	const [replySending, setReplySending] = useState(false);
	const [showLinkPicker, setShowLinkPicker] = useState(false);
	const [dossierFilterText, setDossierFilterText] = useState('');

	// New email composer modal
	const [composeOpen, setComposeOpen] = useState(false);
	const [composeTo, setComposeTo] = useState('');
	const [composeCc, setComposeCc] = useState('');
	const [composeSubject, setComposeSubject] = useState('');
	const [composeBody, setComposeBody] = useState('');
	const [composeDossierId, setComposeDossierId] = useState('');
	const [composeSending, setComposeSending] = useState(false);

	const loadMailbox = useCallback(async () => {
		try {
			const res = await fetchMailboxMessages({
				userId: metadata.activeUserId,
				folder,
				search: search.trim() || undefined,
				top: 35,
				domain: metadata.domain,
			});
			setMessages(res.messages);
			setDossiers(res.dossiers);
			if (res.connectedEmail) setConnectedEmail(res.connectedEmail);
		} catch {
			// Keep previous messages on transient error
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [metadata.activeUserId, metadata.domain, folder, search]);

	useEffect(() => {
		setLoading(true);
		void loadMailbox();
	}, [loadMailbox]);

	const filteredDossiersForLink = useMemo(() => {
		const q = dossierFilterText.trim().toLowerCase();
		if (!q) return dossiers.slice(0, 15);
		return dossiers.filter((d) => d.name.toLowerCase().includes(q) || d.dossierCode.toLowerCase().includes(q) || (d.address || '').toLowerCase().includes(q)).slice(0, 15);
	}, [dossiers, dossierFilterText]);

	const handleQuickLinkDossier = async (msg: StudioMailMessage, dossierId: string, projectId?: string, projectName?: string) => {
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
		const targetDossier = dossiers.find((d) => d.id === dossierId);
		try {
			await linkMailThreadToDossier(
				{
					userId: metadata.activeUserId,
					dossierId,
					projectId: projectId || targetDossier?.projects?.[0]?.id,
					projectName: projectName || targetDossier?.name,
					conversationId: msg.conversationId,
					graphMessageId: msg.graphMessageId,
					messageSnapshot: msg,
				},
				metadata.domain
			);
			const updatedLink = {
				threadId: msg.conversationId,
				dossierId,
				dossierCode: targetDossier?.dossierCode || 'DOSSIER',
				projectName: projectName || targetDossier?.name || '',
			};
			setMessages((prev) => prev.map((m) => (m.graphMessageId === msg.graphMessageId ? { ...m, linkedThread: updatedLink } : m)));
			if (selectedThread?.graphMessageId === msg.graphMessageId) {
				setSelectedThread((prev) => (prev ? { ...prev, linkedThread: updatedLink } : null));
			}
			setShowLinkPicker(false);
		} catch {}
	};

	const handleThreadAction = async (msg: StudioMailMessage, action: 'markread' | 'markunread' | 'flag' | 'archive' | 'delete') => {
		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
		if (action === 'archive' || action === 'delete') {
			setMessages((prev) => prev.filter((m) => m.graphMessageId !== msg.graphMessageId));
			setSelectedThread(null);
		}
		try {
			await performMailMessageAction(
				{
					userId: metadata.activeUserId,
					messageId: msg.graphMessageId,
					messageIds: (msg.threadMessages || []).map((tm) => tm.graphMessageId),
					action,
				},
				metadata.domain
			);
		} catch {}
	};

	const handleSendReply = async () => {
		if (!selectedThread || !replyText.trim()) return;
		setReplySending(true);
		try {
			const replyRecipient = selectedThread.from?.email || selectedThread.to?.[0]?.email || '';
			const cleanSubj = selectedThread.subject?.toLowerCase().startsWith('re:') ? selectedThread.subject : `Re: ${selectedThread.subject}`;
			await sendStudioEmail(
				{
					userId: metadata.activeUserId,
					to: replyRecipient,
					subject: cleanSubj,
					bodyText: replyText.trim(),
					replyToGraphMessageId: selectedThread.graphMessageId,
					inReplyToInternetMessageId: selectedThread.internetMessageId,
					conversationId: selectedThread.conversationId,
					dossierId: selectedThread.linkedThread?.dossierId,
					projectId: selectedThread.linkedThread?.projectId,
					projectName: selectedThread.linkedThread?.projectName,
				},
				metadata.domain
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			setReplyText('');
			setSelectedThread(null);
			void loadMailbox();
		} catch {
		} finally {
			setReplySending(false);
		}
	};

	const handleSendCompose = async () => {
		if (!composeTo.trim() || !composeSubject.trim()) return;
		setComposeSending(true);
		try {
			const linkedDossier = dossiers.find((d) => d.id === composeDossierId);
			await sendStudioEmail(
				{
					userId: metadata.activeUserId,
					to: composeTo.trim(),
					cc: composeCc.trim() || undefined,
					subject: composeSubject.trim(),
					bodyText: composeBody.trim(),
					dossierId: linkedDossier?.id,
					projectId: linkedDossier?.projects?.[0]?.id,
					projectName: linkedDossier?.name,
				},
				metadata.domain
			);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			setComposeOpen(false);
			setComposeTo('');
			setComposeCc('');
			setComposeSubject('');
			setComposeBody('');
			setComposeDossierId('');
			void loadMailbox();
		} catch {
		} finally {
			setComposeSending(false);
		}
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			{/* Header & Folder Switcher */}
			<View style={[styles.topHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
				<View style={styles.titleRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: theme.accent }]}>PROJECT MAIL & OUTLOOK {connectedEmail ? `· ${connectedEmail.toUpperCase()}` : ''}</Text>
						<Text style={[styles.title, { color: theme.text }]}>Mailbox ({messages.length})</Text>
					</View>
					<TouchableOpacity activeOpacity={0.85} onPress={() => setComposeOpen(true)} style={[styles.composeBtn, { backgroundColor: theme.accent }]}>
						<Text style={styles.composeBtnText}>+ Nieuw Bericht</Text>
					</TouchableOpacity>
				</View>

				<TextInput
					value={search}
					onChangeText={setSearch}
					placeholder="Zoek op afzender, onderwerp of inhoud..."
					placeholderTextColor={theme.textMuted}
					style={[styles.searchInput, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
				/>

				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
					{[
						{ id: 'inbox' as const, label: '📥 Inbox' },
						{ id: 'sentitems' as const, label: '📤 Verzonden' },
						{ id: 'archive' as const, label: '📦 Archief' },
						{ id: 'deleteditems' as const, label: '🗑 Prullenbak' },
					].map((f) => {
						const active = folder === f.id;
						return (
							<TouchableOpacity
								key={f.id}
								activeOpacity={0.8}
								onPress={() => setFolder(f.id)}
								style={[
									styles.folderChip,
									{
										backgroundColor: active ? theme.accentSoft : theme.recessed,
										borderColor: active ? theme.accentBorder : theme.border,
									},
								]}
							>
								<Text style={[styles.folderChipText, { color: active ? theme.accent : theme.textMuted }]}>{f.label}</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			</View>

			{loading ? (
				<View style={styles.centerBox}>
					<ActivityIndicator size="large" color={theme.accent} />
					<Text style={[styles.loaderText, { color: theme.textMuted }]}>E-mails & dossierkoppelingen laden...</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={styles.listContent}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={() => {
								setRefreshing(true);
								void loadMailbox();
							}}
							tintColor={theme.accent}
						/>
					}
				>
					{messages.length === 0 ? (
						<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
							<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen e-mails in deze map</Text>
							<Text style={[styles.emptySub, { color: theme.textMuted }]}>Tik rechtsboven op + Nieuw Bericht om een e-mail te versturen.</Text>
						</View>
					) : (
						messages.map((msg) => {
							const linked = msg.linkedThread;
							const suggestion = !linked && msg.suggestions?.[0] ? msg.suggestions[0] : null;
							const msgCount = msg.threadMessages?.length || 1;

							return (
								<TouchableOpacity
									key={msg.graphMessageId}
									activeOpacity={0.82}
									onPress={() => {
										setSelectedThread(msg);
										setShowLinkPicker(false);
										if (!msg.isRead) {
											setMessages((prev) => prev.map((m) => (m.graphMessageId === msg.graphMessageId ? { ...m, isRead: true } : m)));
											void performMailMessageAction({ userId: metadata.activeUserId, messageId: msg.graphMessageId, action: 'markread' }, metadata.domain);
										}
									}}
									style={[
										styles.mailCard,
										{
											backgroundColor: theme.card,
											borderColor: !msg.isRead ? theme.accentBorder : theme.border,
										},
									]}
								>
									<View style={styles.mailTopRow}>
										<View style={styles.senderRow}>
											{!msg.isRead && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
											<Text style={[styles.senderText, { color: theme.text }]} numberOfLines={1}>
												{msg.from?.name || msg.from?.email || 'Onbekend'}
											</Text>
											{msgCount > 1 && (
												<View style={[styles.countBadge, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
													<Text style={[styles.countBadgeText, { color: theme.accent }]}>{msgCount}</Text>
												</View>
											)}
										</View>
										<Text style={[styles.dateText, { color: theme.textMuted }]}>
											{new Date(msg.sentAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
										</Text>
									</View>

									<Text style={[styles.subjectText, { color: !msg.isRead ? theme.text : theme.text }]} numberOfLines={1}>
										{msg.subject}
									</Text>

									<Text style={[styles.previewText, { color: theme.textMuted }]} numberOfLines={2}>
										{msg.bodyPreview}
									</Text>

									{/* Linked Dossier Badge or 1-Tap Suggestion */}
									<View style={styles.linkActionRow}>
										{linked ? (
											<TouchableOpacity
												activeOpacity={0.8}
												onPress={() => onOpenDossier(linked.dossierId)}
												style={[styles.linkedChip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
											>
												<Text style={[styles.linkedChipText, { color: theme.accent }]} numberOfLines={1}>
													📁 Gekoppeld: {linked.dossierCode} {linked.projectName ? `· ${linked.projectName}` : ''}
												</Text>
											</TouchableOpacity>
										) : suggestion ? (
											<TouchableOpacity
												activeOpacity={0.85}
												onPress={() => void handleQuickLinkDossier(msg, suggestion.dossierId, suggestion.projectId, suggestion.projectName || suggestion.dossierName)}
												style={[styles.suggestionChip, { backgroundColor: theme.recessed, borderColor: theme.accentBorder }]}
											>
												<Text style={[styles.suggestionChipText, { color: theme.accent }]} numberOfLines={1}>
													🔗 1-Tap Koppel aan {suggestion.dossierCode} · {suggestion.dossierName}
												</Text>
											</TouchableOpacity>
										) : null}
									</View>
								</TouchableOpacity>
							);
						})
					)}
				</ScrollView>
			)}

			{/* Modal: Thread Reader, Dossier Linker & Quick Reply */}
			<Modal visible={selectedThread !== null} animationType="slide" transparent onRequestClose={() => setSelectedThread(null)}>
				<View style={styles.modalBackdrop}>
					<View style={[styles.modalSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
						<View style={[styles.modalHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.overline, { color: theme.accent }]}>E-MAIL CONVERSATIE</Text>
								<Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
									{selectedThread?.subject}
								</Text>
							</View>
							<TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedThread(null)} style={[styles.closeBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
								<Text style={[styles.closeBtnText, { color: theme.text }]}>Sluiten ✕</Text>
							</TouchableOpacity>
						</View>

						{selectedThread && (
							<ScrollView contentContainerStyle={styles.modalScroll}>
								{/* Quick Thread Actions Bar */}
								<View style={styles.threadToolbar}>
									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => setShowLinkPicker((v) => !v)}
										style={[styles.toolBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
									>
										<Text style={[styles.toolBtnText, { color: theme.accent }]}>
											{selectedThread.linkedThread ? `📁 ${selectedThread.linkedThread.dossierCode}` : '🔗 Koppel Dossier'}
										</Text>
									</TouchableOpacity>

									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => void handleThreadAction(selectedThread, 'archive')}
										style={[styles.toolBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
									>
										<Text style={[styles.toolBtnText, { color: theme.text }]}>📦 Archiveer</Text>
									</TouchableOpacity>

									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => void handleThreadAction(selectedThread, 'delete')}
										style={[styles.toolBtn, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: theme.accentRed }]}
									>
										<Text style={[styles.toolBtnText, { color: theme.accentRed }]}>🗑 Verwijder</Text>
									</TouchableOpacity>
								</View>

								{/* Dossier Link Picker */}
								{showLinkPicker && (
									<View style={[styles.linkPickerBox, { backgroundColor: theme.card, borderColor: theme.accentBorder }]}>
										<Text style={[styles.sectionLabel, { color: theme.accent }]}>KIES DOSSIER OM TE KOPPELEN</Text>
										<TextInput
											value={dossierFilterText}
											onChangeText={setDossierFilterText}
											placeholder="Zoek D-nummer of klantnaam..."
											placeholderTextColor={theme.textMuted}
											style={[styles.input, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
										/>
										{filteredDossiersForLink.map((d) => (
											<TouchableOpacity
												key={d.id}
												activeOpacity={0.8}
												onPress={() => void handleQuickLinkDossier(selectedThread, d.id, d.projects?.[0]?.id, d.name)}
												style={[styles.linkOption, { borderBottomColor: theme.border }]}
											>
												<Text style={[styles.linkOptionCode, { color: theme.accent }]}>{d.dossierCode}</Text>
												<Text style={[styles.linkOptionName, { color: theme.text }]} numberOfLines={1}>
													{d.name}
												</Text>
											</TouchableOpacity>
										))}
									</View>
								)}

								{/* Conversation Messages */}
								{(selectedThread.threadMessages?.length ? selectedThread.threadMessages : [selectedThread]).map((m) => (
									<View key={m.graphMessageId} style={[styles.msgBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
										<View style={styles.msgBubbleHeader}>
											<Text style={[styles.msgAuthor, { color: theme.accent }]}>{m.from?.name || m.from?.email}</Text>
											<Text style={[styles.dateText, { color: theme.textMuted }]}>
												{new Date(m.sentAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
											</Text>
										</View>
										<Text style={[styles.msgBodyText, { color: theme.text }]}>{stripHtmlTags(m.bodyText || m.bodyHtml || m.bodyPreview) || '(Geen tekstinhoud)'}</Text>
									</View>
								))}

								{/* Direct Reply Box */}
								<View style={[styles.replyBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
									<Text style={[styles.sectionLabel, { color: theme.accent }]}>DIRECT BEANTWOORDEN</Text>
									<TextInput
										value={replyText}
										onChangeText={setReplyText}
										placeholder="Typ je antwoord..."
										placeholderTextColor={theme.textMuted}
										multiline
										style={[styles.input, styles.textArea, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
									/>
									<TouchableOpacity activeOpacity={0.85} onPress={handleSendReply} disabled={replySending} style={[styles.sendBtn, { backgroundColor: theme.accent }]}>
										{replySending ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.sendBtnText}>↩️ Antwoord Versturen</Text>}
									</TouchableOpacity>
								</View>
							</ScrollView>
						)}
					</View>
				</View>
			</Modal>

			{/* Modal: Compose New Email */}
			<Modal visible={composeOpen} animationType="slide" transparent onRequestClose={() => setComposeOpen(false)}>
				<View style={styles.modalBackdrop}>
					<View style={[styles.modalSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
						<View style={[styles.modalHeader, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
							<View>
								<Text style={[styles.overline, { color: theme.accent }]}>NIEUW BERICHT OPSTELLEN</Text>
								<Text style={[styles.modalTitle, { color: theme.text }]}>E-mail Versturen</Text>
							</View>
							<TouchableOpacity activeOpacity={0.8} onPress={() => setComposeOpen(false)} style={[styles.closeBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
								<Text style={[styles.closeBtnText, { color: theme.text }]}>Sluiten ✕</Text>
							</TouchableOpacity>
						</View>

						<ScrollView contentContainerStyle={styles.modalScroll}>
							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>AAN</Text>
							<TextInput
								value={composeTo}
								onChangeText={setComposeTo}
								placeholder="ontvanger@voorbeeld.be"
								placeholderTextColor={theme.textMuted}
								autoCapitalize="none"
								keyboardType="email-address"
								style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CC (OPTIONEEL)</Text>
							<TextInput
								value={composeCc}
								onChangeText={setComposeCc}
								placeholder="cc@voorbeeld.be"
								placeholderTextColor={theme.textMuted}
								autoCapitalize="none"
								keyboardType="email-address"
								style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>ONDERWERP</Text>
							<TextInput
								value={composeSubject}
								onChangeText={setComposeSubject}
								placeholder="Onderwerp van je e-mail"
								placeholderTextColor={theme.textMuted}
								style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							<Text style={[styles.sectionLabel, { color: theme.textMuted }]}>BERICHT</Text>
							<TextInput
								value={composeBody}
								onChangeText={setComposeBody}
								placeholder="Schrijf je bericht..."
								placeholderTextColor={theme.textMuted}
								multiline
								style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
							/>

							<TouchableOpacity activeOpacity={0.85} onPress={handleSendCompose} disabled={composeSending} style={[styles.sendBtn, { backgroundColor: theme.accent }]}>
								{composeSending ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.sendBtnText}>E-mail Versturen</Text>}
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
	titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
	title: { fontSize: 20, fontWeight: '900' },
	composeBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14 },
	composeBtnText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	searchInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
	folderRow: { flexDirection: 'row', gap: 6 },
	folderChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	folderChipText: { fontSize: 11, fontWeight: '800' },
	centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
	loaderText: { fontSize: 13 },
	listContent: { padding: 14, gap: 10, paddingBottom: 32 },
	emptyCard: { borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center', gap: 6 },
	emptyTitle: { fontSize: 15, fontWeight: '800' },
	emptySub: { fontSize: 12, textAlign: 'center' },
	mailCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 5 },
	mailTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
	unreadDot: { width: 8, height: 8, borderRadius: 4 },
	senderText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
	countBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, borderWidth: 1 },
	countBadgeText: { fontSize: 10, fontWeight: '800' },
	dateText: { fontSize: 10, fontWeight: '600' },
	subjectText: { fontSize: 14, fontWeight: '800' },
	previewText: { fontSize: 12, lineHeight: 17 },
	linkActionRow: { marginTop: 4 },
	linkedChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
	linkedChipText: { fontSize: 10, fontWeight: '800' },
	suggestionChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
	suggestionChipText: { fontSize: 10, fontWeight: '800' },
	modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'flex-end' },
	modalSheet: { height: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, overflow: 'hidden' },
	modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, gap: 10 },
	modalTitle: { fontSize: 16, fontWeight: '800', marginTop: 2 },
	closeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	closeBtnText: { fontSize: 12, fontWeight: '800' },
	modalScroll: { padding: 16, gap: 12, paddingBottom: 36 },
	threadToolbar: { flexDirection: 'row', gap: 8 },
	toolBtn: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
	toolBtnText: { fontSize: 11, fontWeight: '800' },
	linkPickerBox: { borderRadius: 18, borderWidth: 1, padding: 12, gap: 8 },
	linkOption: { paddingVertical: 8, borderBottomWidth: 1 },
	linkOptionCode: { fontSize: 10, fontWeight: '800' },
	linkOptionName: { fontSize: 12, fontWeight: '700' },
	msgBubble: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 6 },
	msgBubbleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	msgAuthor: { fontSize: 12, fontWeight: '800' },
	msgBodyText: { fontSize: 13, lineHeight: 19 },
	replyBox: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
	sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
	input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
	textArea: { minHeight: 90 },
	sendBtn: { paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
	sendBtnText: { color: '#090b09', fontSize: 13, fontWeight: '900' },
});
