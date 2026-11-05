/** @format */

import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { type MobileMetadata, saveMobileMetadata } from '../metadata';
import { dispatchMobileNotification, scheduleDailyWerkbonReminder } from '../notifications';
import { type MobileThemePalette } from '../theme';
import { type MobileUpdateCheckResult, checkMobileRelease, MOBILE_CLIENT_VERSION, openMobileUpdateInstaller } from '../updater';

interface SettingsScreenProps {
	metadata: MobileMetadata;
	onMetadataChange: (next: MobileMetadata) => void;
	updateInfo: MobileUpdateCheckResult | null;
	onUpdateInfoChange: (info: MobileUpdateCheckResult) => void;
	theme: MobileThemePalette;
}

export function SettingsScreen({ metadata, onMetadataChange, updateInfo, onUpdateInfoChange, theme }: SettingsScreenProps) {
	const [domainInput, setDomainInput] = useState(metadata.domain);
	const [checkingUpdate, setCheckingUpdate] = useState(false);
	const [installingUpdate, setInstallingUpdate] = useState(false);

	const updateFlag = async (patch: Partial<MobileMetadata>) => {
		const saved = await saveMobileMetadata(patch);
		onMetadataChange(saved);
		if (typeof patch.dailyWorkOrderReminder === 'boolean') {
			await scheduleDailyWerkbonReminder(patch.dailyWorkOrderReminder);
		}
	};

	const handleSaveDomain = async () => {
		const cleaned = domainInput.trim() || 'crea-accent.app';
		setDomainInput(cleaned);
		await updateFlag({ domain: cleaned });
	};

	const handleCheckMobileUpdate = async () => {
		setCheckingUpdate(true);
		try {
			const res = await checkMobileRelease(metadata.domain);
			onUpdateInfoChange(res);
		} finally {
			setCheckingUpdate(false);
		}
	};

	const handleInstallMobileUpdate = async () => {
		setInstallingUpdate(true);
		try {
			await openMobileUpdateInstaller(updateInfo || undefined, metadata.domain);
		} finally {
			setInstallingUpdate(false);
		}
	};

	const handleTestNotification = async () => {
		await dispatchMobileNotification({
			title: 'Crea-Accent Studio Mobile',
			body: `Testmelding op ${Platform.OS === 'ios' ? 'iOS' : 'Android'} geslaagd!`,
			force: true,
		});
	};

	const isOutdated = Boolean(updateInfo?.outdated);
	const platformLabel = Platform.OS === 'ios' ? 'iOS (IPA / App Store)' : 'Android (APK / Play)';

	return (
		<ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
			{/* Independent Mobile Release Updater Card */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: isOutdated ? theme.accentOrange : theme.border }]}>
				<View style={styles.headerRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: isOutdated ? theme.accentOrange : theme.accent }]}>
							{isOutdated ? 'MOBIELE UPDATE BESCHIKBAAR' : 'MOBIELE RELEASE-KANAAL (ONAFHANKELIJK VAN DESKTOP)'}
						</Text>
						<Text style={[styles.cardTitle, { color: theme.text }]}>Crea-Accent Studio Mobile v{MOBILE_CLIENT_VERSION}</Text>
						<Text style={[styles.cardSub, { color: theme.textMuted }]}>
							Platform: {platformLabel} • Release-tag: {updateInfo?.tagName || `mobile@${MOBILE_CLIENT_VERSION}`}
						</Text>
					</View>
				</View>

				<View style={[styles.versionGrid, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
					<View style={styles.versionCell}>
						<Text style={[styles.versionLabel, { color: theme.textMuted }]}>Geïnstalleerd</Text>
						<Text style={[styles.versionValue, { color: theme.text }]}>v{MOBILE_CLIENT_VERSION}</Text>
					</View>
					<View style={styles.versionCell}>
						<Text style={[styles.versionLabel, { color: theme.textMuted }]}>Laatste Mobile</Text>
						<Text style={[styles.versionValue, { color: isOutdated ? theme.accentOrange : theme.accentGreen }]}>v{updateInfo?.latestVersion || MOBILE_CLIENT_VERSION}</Text>
					</View>
					<View style={styles.versionCell}>
						<Text style={[styles.versionLabel, { color: theme.textMuted }]}>Kanaal</Text>
						<Text style={[styles.versionValue, { color: theme.accent }]}>{updateInfo?.channel || 'stable'}</Text>
					</View>
				</View>

				<View style={styles.buttonRow}>
					<TouchableOpacity
						activeOpacity={0.8}
						onPress={handleCheckMobileUpdate}
						disabled={checkingUpdate}
						style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border, flex: 1 }]}
					>
						{checkingUpdate ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Controleer op Update</Text>}
					</TouchableOpacity>

					{isOutdated && (
						<TouchableOpacity activeOpacity={0.8} onPress={handleInstallMobileUpdate} disabled={installingUpdate} style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}>
							<Text style={styles.primaryBtnText}>{Platform.OS === 'ios' ? 'Download iOS Update' : 'Installeer Android APK'}</Text>
						</TouchableOpacity>
					)}
				</View>
			</View>

			{/* Mobile Preferences */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.cardTitle, { color: theme.text }]}>Mobiele Voorkeuren</Text>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Biometrisch Privacy Shield</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Vergrendel app met Face ID / Touch ID of vingerafdruk in achtergrond</Text>
					</View>
					<Switch value={metadata.biometricLock} onValueChange={(v) => updateFlag({ biometricLock: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Push- & Lokale Meldingen</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Ontvang meldingen voor dossiers, planning en berichten</Text>
					</View>
					<Switch value={metadata.pushNotifications} onValueChange={(v) => updateFlag({ pushNotifications: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Dagelijkse Werkbon-herinnering (16:45)</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Herinnering om openstaande werkbonnen van vandaag af te ronden</Text>
					</View>
					<Switch value={metadata.dailyWorkOrderReminder} onValueChange={(v) => updateFlag({ dailyWorkOrderReminder: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Haptische Feedback</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Voelbare trilling bij navigatie en acties</Text>
					</View>
					<Switch value={metadata.hapticFeedback} onValueChange={(v) => updateFlag({ hapticFeedback: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={styles.toggleRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Donkere Modus</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Schakel tussen Dark & Light glasmorfisme thema</Text>
					</View>
					<Switch value={metadata.themeMode === 'dark'} onValueChange={(v) => updateFlag({ themeMode: v ? 'dark' : 'light' })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<TouchableOpacity activeOpacity={0.8} onPress={handleTestNotification} style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
					<Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Stuur Testmelding</Text>
				</TouchableOpacity>
			</View>

			{/* Server & LAN Domain */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.cardTitle, { color: theme.text }]}>Server & LAN-verbinding</Text>
				<Text style={[styles.cardSub, { color: theme.textMuted }]}>Standaard: crea-accent.app (of lokaal LAN IP voor ontwikkelomgeving)</Text>
				<View style={styles.buttonRow}>
					<TextInput
						value={domainInput}
						onChangeText={setDomainInput}
						placeholder="crea-accent.app"
						placeholderTextColor={theme.textMuted}
						autoCapitalize="none"
						autoCorrect={false}
						style={[styles.domainInput, { backgroundColor: theme.recessed, color: theme.text, borderColor: theme.border, flex: 1 }]}
					/>
					<TouchableOpacity activeOpacity={0.8} onPress={handleSaveDomain} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
						<Text style={styles.primaryBtnText}>Opslaan</Text>
					</TouchableOpacity>
				</View>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, gap: 14, paddingBottom: 32 },
	card: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 12 },
	headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 3 },
	cardTitle: { fontSize: 16, fontWeight: '800' },
	cardSub: { fontSize: 12, marginTop: 2 },
	versionGrid: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 12 },
	versionCell: { flex: 1, alignItems: 'center' },
	versionLabel: { fontSize: 10, marginBottom: 2 },
	versionValue: { fontSize: 13, fontWeight: '800' },
	buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	primaryBtn: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	primaryBtnText: { color: '#090b09', fontSize: 12, fontWeight: '800' },
	secondaryBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	secondaryBtnText: { fontSize: 12, fontWeight: '700' },
	toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
	toggleTitle: { fontSize: 13, fontWeight: '700' },
	toggleDesc: { fontSize: 11, marginTop: 2 },
	domainInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
});
