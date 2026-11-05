/** @format */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { resolveMobileApiBaseUrl, resolveMobileTargetUrl } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface MobileDossierSummary {
	id: string;
	name: string;
	clientName?: string;
	address?: string;
	stage?: string;
	updatedAt?: string;
}

interface DossiersScreenProps {
	domain: string;
	theme: MobileThemePalette;
	onOpenWorkspaceUrl: (url: string) => void;
}

export function DossiersScreen({ domain, theme, onOpenWorkspaceUrl }: DossiersScreenProps) {
	const [dossiers, setDossiers] = useState<MobileDossierSummary[]>([]);
	const [query, setQuery] = useState('');
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const fetchDossiers = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setRefreshing(true);
			else setLoading(true);

			try {
				const apiBase = resolveMobileApiBaseUrl(domain);
				const res = await fetch(`${apiBase}/secure/dossiers`, {
					credentials: 'include',
					headers: { Accept: 'application/json' },
				});
				if (res.ok) {
					const data = await res.json();
					const list = Array.isArray(data?.dossiers) ? data.dossiers : Array.isArray(data) ? data : [];
					setDossiers(list);
				}
			} catch {}
			setLoading(false);
			setRefreshing(false);
		},
		[domain]
	);

	useEffect(() => {
		fetchDossiers(false);
	}, [fetchDossiers]);

	const filtered = dossiers.filter((d) => {
		if (!query.trim()) return true;
		const q = query.trim().toLowerCase();
		return (
			String(d.name || '')
				.toLowerCase()
				.includes(q) ||
			String(d.clientName || '')
				.toLowerCase()
				.includes(q) ||
			String(d.address || '')
				.toLowerCase()
				.includes(q)
		);
	});

	const handleOpenDossier = (dossierId: string) => {
		const target = resolveMobileTargetUrl(`https://app.crea-accent.app/?tab=dossiers&dossier=${encodeURIComponent(dossierId)}`, domain);
		onOpenWorkspaceUrl(target);
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			<View style={[styles.searchHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
				<Text style={[styles.headerTitle, { color: theme.text }]}>Dossiers & Werven</Text>
				<TextInput
					value={query}
					onChangeText={setQuery}
					placeholder="Zoek dossier, klant of werfadres…"
					placeholderTextColor={theme.textMuted}
					style={[styles.searchInput, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border }]}
				/>
			</View>

			<ScrollView
				style={styles.list}
				contentContainerStyle={styles.listContent}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchDossiers(true)} tintColor={theme.accent} />}
			>
				{loading ? (
					<View style={styles.emptyCard}>
						<ActivityIndicator size="small" color={theme.accent} />
						<Text style={[styles.emptyText, { color: theme.textMuted }]}>Dossiers laden…</Text>
					</View>
				) : filtered.length === 0 ? (
					<View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
						<Text style={[styles.emptyTitle, { color: theme.text }]}>Geen dossiers gevonden</Text>
						<Text style={[styles.emptyText, { color: theme.textMuted }]}>
							Open de volledige Dossiers-werkruimte in de Studio-tab om alle NAS-mappen, Trikker-schema's en Duotecno-projecten te bekijken.
						</Text>
						<TouchableOpacity
							activeOpacity={0.8}
							onPress={() => onOpenWorkspaceUrl(resolveMobileTargetUrl('https://app.crea-accent.app/?tab=dossiers', domain))}
							style={[styles.openAllBtn, { backgroundColor: theme.accent }]}
						>
							<Text style={styles.openAllBtnText}>Open Dossiers in Studio</Text>
						</TouchableOpacity>
					</View>
				) : (
					filtered.slice(0, 40).map((d) => (
						<TouchableOpacity
							key={d.id}
							activeOpacity={0.8}
							onPress={() => handleOpenDossier(d.id)}
							style={[styles.dossierCard, { backgroundColor: theme.card, borderColor: theme.border }]}
						>
							<View style={styles.dossierTopRow}>
								<Text style={[styles.dossierName, { color: theme.text }]} numberOfLines={1}>
									{d.name}
								</Text>
								{d.stage && (
									<View style={[styles.stageBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
										<Text style={[styles.stageText, { color: theme.accent }]}>{d.stage}</Text>
									</View>
								)}
							</View>
							{(d.clientName || d.address) && (
								<Text style={[styles.dossierSub, { color: theme.textMuted }]} numberOfLines={1}>
									{[d.clientName, d.address].filter(Boolean).join(' • ')}
								</Text>
							)}
						</TouchableOpacity>
					))
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	searchHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
	headerTitle: { fontSize: 18, fontWeight: '800' },
	searchInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
	list: { flex: 1 },
	listContent: { padding: 16, gap: 10, paddingBottom: 32 },
	emptyCard: { borderRadius: 24, borderWidth: 1, padding: 20, alignItems: 'center', gap: 10 },
	emptyTitle: { fontSize: 14, fontWeight: '700' },
	emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
	openAllBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 },
	openAllBtnText: { color: '#090b09', fontSize: 12, fontWeight: '800' },
	dossierCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 4 },
	dossierTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	dossierName: { flex: 1, fontSize: 14, fontWeight: '700' },
	stageBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
	stageText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
	dossierSub: { fontSize: 12 },
});
