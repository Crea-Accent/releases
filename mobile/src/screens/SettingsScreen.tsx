/** @format */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { loginWithEmailPassword } from '../api';
import { detectExpoPackagerLanIp, type MobileMetadata, resolveMobileApiBaseUrl, saveMobileMetadata } from '../metadata';
import { dispatchMobileNotification, scheduleDailyWerkbonReminder } from '../notifications';
import { type MobileThemePalette } from '../theme';
import { checkMobileRelease, MOBILE_CLIENT_VERSION, type MobileUpdateCheckResult, openMobileUpdateInstaller } from '../updater';

interface SettingsScreenProps {
	metadata: MobileMetadata;
	onMetadataChange: (next: MobileMetadata) => void;
	updateInfo: MobileUpdateCheckResult | null;
	onUpdateInfoChange: (info: MobileUpdateCheckResult) => void;
	initialPairCode?: string;
	theme: MobileThemePalette;
}

export function SettingsScreen({ metadata, onMetadataChange, updateInfo, onUpdateInfoChange, initialPairCode, theme }: SettingsScreenProps) {
	// Native login form state
	const [showLoginForm, setShowLoginForm] = useState(false);
	const [loginEmail, setLoginEmail] = useState(metadata.activeUserEmail);
	const [loginPassword, setLoginPassword] = useState('');
	const [loginBusy, setLoginBusy] = useState(false);
	const [loginStatus, setLoginStatus] = useState<string | null>(null);
	const [loginError, setLoginError] = useState<string | null>(null);

	// Native 6-digit QR / Code pairing state
	const [pairCode, setPairCode] = useState(initialPairCode || '');
	const [pairBusy, setPairBusy] = useState(false);
	const [pairStatus, setPairStatus] = useState<string | null>(null);
	const [pairError, setPairError] = useState<string | null>(null);
	const [pendingLookup, setPendingLookup] = useState<{ token: string; pairCode: string; deviceInfo: string } | null>(null);

	// Server & updater state
	const [domainInput, setDomainInput] = useState(metadata.domain);
	const [checkingUpdate, setCheckingUpdate] = useState(false);
	const [installingUpdate, setInstallingUpdate] = useState(false);

	useEffect(() => {
		if (initialPairCode && initialPairCode.length === 6) {
			setPairCode(initialPairCode);
		}
	}, [initialPairCode]);

	const updateFlag = async (patch: Partial<MobileMetadata>) => {
		const saved = await saveMobileMetadata(patch);
		onMetadataChange(saved);
		if (typeof patch.dailyWorkOrderReminder === 'boolean') {
			await scheduleDailyWerkbonReminder(patch.dailyWorkOrderReminder);
		}
	};

	const handleSignInNative = async () => {
		if (!loginEmail.trim() || !loginPassword.trim()) {
			setLoginError('Voer je e-mailadres en wachtwoord in.');
			return;
		}
		setLoginBusy(true);
		setLoginError(null);
		setLoginStatus(null);
		try {
			const user = await loginWithEmailPassword(loginEmail.trim(), loginPassword, metadata.domain);
			const saved = await saveMobileMetadata({
				activeUserId: user.id || user.userId || loginEmail.trim(),
				activeUserName: user.name || loginEmail.split('@')[0],
				activeUserEmail: user.email || loginEmail.trim().toLowerCase(),
				activeUserRole: user.roleId === 'admin' ? 'Administrator' : 'Team Member',
			});
			onMetadataChange(saved);
			setLoginPassword('');
			setShowLoginForm(false);
			setLoginStatus(`Aangemeld als ${saved.activeUserName}`);
			void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
		} catch (err: any) {
			setLoginError(err?.message || 'Inloggen mislukt.');
		} finally {
			setLoginBusy(false);
		}
	};

	const cleanCode = pairCode
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

	const handleLookupPairCode = async () => {
		if (cleanCode.length !== 6) {
			setPairError('Voer een geldige 6-teken koppelcode in (bijv. ABC-123).');
			return;
		}
		setPairBusy(true);
		setPairError(null);
		setPairStatus(null);
		try {
			const apiBase = resolveMobileApiBaseUrl(metadata.domain);
			const res = await fetch(`${apiBase}/secure/auth/qr?code=${encodeURIComponent(cleanCode)}`);
			if (!res.ok) {
				setPairError('Koppelcode niet gevonden of verlopen.');
				return;
			}
			const data = await res.json();
			if (data?.token && data?.pairCode) {
				setPendingLookup({
					token: data.token,
					pairCode: data.pairCode,
					deviceInfo: data.deviceInfo || 'Crea-Accent Desktop',
				});
			} else {
				setPairError('Geen wachtend toestel gevonden voor deze code.');
			}
		} catch {
			setPairError('Kan de koppelserver niet bereiken.');
		} finally {
			setPairBusy(false);
		}
	};

	const handleApprovePairDevice = async () => {
		if (!pendingLookup) return;
		setPairBusy(true);
		setPairError(null);
		try {
			const apiBase = resolveMobileApiBaseUrl(metadata.domain);
			const res = await fetch(`${apiBase}/secure/auth/qr`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'approve',
					token: pendingLookup.token,
					code: pendingLookup.pairCode,
					username: metadata.activeUserName,
				}),
			});
			if (res.ok) {
				setPairStatus(`Toestel "${pendingLookup.deviceInfo}" is goedgekeurd!`);
				setPendingLookup(null);
				setPairCode('');
				void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
			} else {
				setPairError('Goedkeuren vereist een actieve sessie-ticket.');
			}
		} catch {
			setPairError('Goedkeuren mislukt.');
		} finally {
			setPairBusy(false);
		}
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
	const detectedLanIp = detectExpoPackagerLanIp() || metadata.lanHost || '172.16.10.179';

	return (
		<ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
			{/* Active Account & Native Sign-In Card */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<View style={styles.accountRow}>
					<View style={[styles.avatarCircle, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
						<Text style={[styles.avatarInitials, { color: theme.accent }]}>
							{metadata.activeUserName
								.split(' ')
								.map((p) => p[0])
								.join('')
								.slice(0, 2)
								.toUpperCase()}
						</Text>
					</View>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: theme.accent }]}>ACTIEF STUDIO ACCOUNT</Text>
						<Text style={[styles.cardTitle, { color: theme.text }]}>{metadata.activeUserName}</Text>
						<Text style={[styles.cardSub, { color: theme.textMuted }]}>
							{metadata.activeUserEmail} • {metadata.activeUserRole}
						</Text>
					</View>
					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => setShowLoginForm((v) => !v)}
						style={[styles.secondarySmallBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
					>
						<Text style={[styles.secondarySmallBtnText, { color: theme.accent }]}>{showLoginForm ? 'Sluiten' : 'Wissel'}</Text>
					</TouchableOpacity>
				</View>

				{loginStatus && <Text style={[styles.statusSuccess, { color: theme.accentGreen }]}>{loginStatus}</Text>}
				{loginError && <Text style={[styles.statusError, { color: theme.accentRed }]}>{loginError}</Text>}

				{showLoginForm && (
					<View style={[styles.loginBox, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.overline, { color: theme.accent }]}>AANMELDEN MET E-MAIL & WACHTWOORD</Text>
						<TextInput
							value={loginEmail}
							onChangeText={setLoginEmail}
							placeholder="ray@crea-accent.be"
							placeholderTextColor={theme.textMuted}
							autoCapitalize="none"
							keyboardType="email-address"
							style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
						/>
						<TextInput
							value={loginPassword}
							onChangeText={setLoginPassword}
							placeholder="Wachtwoord"
							placeholderTextColor={theme.textMuted}
							secureTextEntry
							style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
						/>
						<TouchableOpacity activeOpacity={0.85} onPress={handleSignInNative} disabled={loginBusy} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
							{loginBusy ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.primaryBtnText}>Nu Aanmelden</Text>}
						</TouchableOpacity>
					</View>
				)}
			</View>

			{/* Native 6-Digit / QR Device Pairing Card */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.overline, { color: theme.accent }]}>SNEL KOPPELEN & QR LOGIN</Text>
				<Text style={[styles.cardTitle, { color: theme.text }]}>6-Cijfer Toestel Koppeling</Text>
				<Text style={[styles.cardSub, { color: theme.textMuted }]}>
					Voer de 6-teken code in die op een wachtend Desktop- of Web-aanmeldscherm staat om deze te controleren en goed te keuren.
				</Text>

				<View style={styles.buttonRow}>
					<TextInput
						value={pairCode}
						onChangeText={(txt) => setPairCode(txt.toUpperCase())}
						placeholder="ABC-123"
						placeholderTextColor={theme.textMuted}
						autoCapitalize="characters"
						autoCorrect={false}
						style={[styles.codeInput, { backgroundColor: theme.recessed, color: theme.accent, borderColor: theme.accentBorder, flex: 1 }]}
					/>
					<TouchableOpacity activeOpacity={0.85} onPress={handleLookupPairCode} disabled={pairBusy} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
						{pairBusy ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.primaryBtnText}>Controleer Code</Text>}
					</TouchableOpacity>
				</View>

				{pairError && <Text style={[styles.statusError, { color: theme.accentRed }]}>{pairError}</Text>}
				{pairStatus && <Text style={[styles.statusSuccess, { color: theme.accentGreen }]}>{pairStatus}</Text>}

				{pendingLookup && (
					<View style={[styles.confirmBox, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Gevonden toestel: {pendingLookup.deviceInfo}</Text>
						<View style={styles.buttonRow}>
							<TouchableOpacity
								activeOpacity={0.8}
								onPress={() => setPendingLookup(null)}
								style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border, flex: 1 }]}
							>
								<Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuleren</Text>
							</TouchableOpacity>
							<TouchableOpacity activeOpacity={0.85} onPress={handleApprovePairDevice} disabled={pairBusy} style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}>
								<Text style={styles.primaryBtnText}>Goedkeuren</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</View>

			{/* Independent Mobile Release Updater Card */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: isOutdated ? theme.accentOrange : theme.border }]}>
				<View style={styles.headerRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.overline, { color: isOutdated ? theme.accentOrange : theme.accent }]}>
							{isOutdated ? 'MOBIELE UPDATE BESCHIKBAAR' : 'MOBIELE RELEASE-KANAAL (APK & IPA)'}
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
				<Text style={[styles.cardTitle, { color: theme.text }]}>Mobiele App Voorkeuren</Text>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Biometrisch Privacy Shield</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Vergrendel app met Face ID / Touch ID of vingerafdruk in achtergrond</Text>
					</View>
					<Switch value={metadata.biometricLock} onValueChange={(v) => void updateFlag({ biometricLock: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Push- & Lokale Meldingen</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Ontvang meldingen voor dossiers, planning en berichten</Text>
					</View>
					<Switch value={metadata.pushNotifications} onValueChange={(v) => void updateFlag({ pushNotifications: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Dagelijkse Werkbon-herinnering (16:45)</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Herinnering om openstaande werkbonnen van vandaag af te ronden</Text>
					</View>
					<Switch value={metadata.dailyWorkOrderReminder} onValueChange={(v) => void updateFlag({ dailyWorkOrderReminder: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Haptische Feedback</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Voelbare trilling bij navigatie en acties</Text>
					</View>
					<Switch value={metadata.hapticFeedback} onValueChange={(v) => void updateFlag({ hapticFeedback: v })} trackColor={{ false: theme.border, true: theme.accent }} />
				</View>

				<View style={styles.toggleRow}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.toggleTitle, { color: theme.text }]}>Donkere Modus</Text>
						<Text style={[styles.toggleDesc, { color: theme.textMuted }]}>Schakel tussen Dark & Light glasmorfisme thema</Text>
					</View>
					<Switch
						value={metadata.themeMode === 'dark'}
						onValueChange={(v) => void updateFlag({ themeMode: v ? 'dark' : 'light' })}
						trackColor={{ false: theme.border, true: theme.accent }}
					/>
				</View>

				<TouchableOpacity activeOpacity={0.8} onPress={handleTestNotification} style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
					<Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Stuur Testmelding</Text>
				</TouchableOpacity>
			</View>

			{/* Server & LAN Domain */}
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.cardTitle, { color: theme.text }]}>Serveromgeving (Cloud vs. Dev LAN)</Text>
				<View style={styles.buttonRow}>
					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() => {
							setDomainInput('crea-accent.app');
							void updateFlag({ connectionMode: 'cloud', domain: 'crea-accent.app' });
						}}
						style={[
							styles.secondaryBtn,
							{
								flex: 1,
								backgroundColor: metadata.connectionMode !== 'lan' ? theme.accentSoft : theme.recessed,
								borderColor: metadata.connectionMode !== 'lan' ? theme.accentBorder : theme.border,
							},
						]}
					>
						<Text style={[styles.secondaryBtnText, { color: metadata.connectionMode !== 'lan' ? theme.accent : theme.text }]}>☁️ Live Cloud</Text>
					</TouchableOpacity>

					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() => {
							setDomainInput(detectedLanIp);
							void updateFlag({ connectionMode: 'lan', domain: detectedLanIp });
						}}
						style={[
							styles.secondaryBtn,
							{
								flex: 1,
								backgroundColor: metadata.connectionMode === 'lan' ? theme.accentSoft : theme.recessed,
								borderColor: metadata.connectionMode === 'lan' ? theme.accentBorder : theme.border,
							},
						]}
					>
						<Text style={[styles.secondaryBtnText, { color: metadata.connectionMode === 'lan' ? theme.accent : theme.text }]}>💻 Dev LAN ({detectedLanIp})</Text>
					</TouchableOpacity>
				</View>

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
					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => {
							const cleaned = domainInput.trim() || 'crea-accent.app';
							setDomainInput(cleaned);
							void updateFlag({ domain: cleaned });
						}}
						style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
					>
						<Text style={styles.primaryBtnText}>Opslaan</Text>
					</TouchableOpacity>
				</View>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 14, gap: 12, paddingBottom: 32 },
	card: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12 },
	accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	avatarCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
	avatarInitials: { fontSize: 16, fontWeight: '900' },
	headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 2 },
	cardTitle: { fontSize: 16, fontWeight: '800' },
	cardSub: { fontSize: 12, marginTop: 1 },
	secondarySmallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
	secondarySmallBtnText: { fontSize: 11, fontWeight: '800' },
	loginBox: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
	input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
	codeInput: { borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, fontSize: 16, fontWeight: '800', textAlign: 'center', letterSpacing: 3 },
	statusSuccess: { fontSize: 12, fontWeight: '700' },
	statusError: { fontSize: 12, fontWeight: '700' },
	confirmBox: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 8 },
	versionGrid: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 12 },
	versionCell: { flex: 1, alignItems: 'center' },
	versionLabel: { fontSize: 10, marginBottom: 2 },
	versionValue: { fontSize: 13, fontWeight: '800' },
	buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	primaryBtn: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	primaryBtnText: { color: '#090b09', fontSize: 12, fontWeight: '900' },
	secondaryBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	secondaryBtnText: { fontSize: 12, fontWeight: '800' },
	toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
	toggleTitle: { fontSize: 13, fontWeight: '700' },
	toggleDesc: { fontSize: 11, marginTop: 2 },
	domainInput: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 },
});
