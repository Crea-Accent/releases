/** @format */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { resolveMobileApiBaseUrl, resolveMobileTargetUrl } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface PairingScreenProps {
	domain: string;
	initialPairCode?: string;
	theme: MobileThemePalette;
	onOpenWorkspaceUrl: (url: string) => void;
}

export function PairingScreen({ domain, initialPairCode, theme, onOpenWorkspaceUrl }: PairingScreenProps) {
	const [code, setCode] = useState(initialPairCode || '');
	const [busy, setBusy] = useState(false);
	const [statusMsg, setStatusMsg] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [pendingLookup, setPendingLookup] = useState<{ token: string; pairCode: string; deviceInfo: string; mode?: string } | null>(null);

	useEffect(() => {
		if (initialPairCode && initialPairCode.length === 6) {
			setCode(initialPairCode);
		}
	}, [initialPairCode]);

	const cleanPairCode = code
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

	const handleSignInWithShareCode = () => {
		if (cleanPairCode.length !== 6) {
			setErrorMsg('Voer een geldige 6-teken koppelcode in (bijv. ABC-123).');
			return;
		}
		setErrorMsg(null);
		const qrLoginUrl = resolveMobileTargetUrl(`https://account.crea-accent.app/login/qr?code=${encodeURIComponent(cleanPairCode)}`, domain);
		onOpenWorkspaceUrl(qrLoginUrl);
	};

	const handleLookupWaitingDesktop = async () => {
		if (cleanPairCode.length !== 6) {
			setErrorMsg('Voer de 6-teken code in die op het aanmeldscherm van je andere toestel staat.');
			return;
		}
		setBusy(true);
		setErrorMsg(null);
		setStatusMsg(null);

		try {
			const apiBase = resolveMobileApiBaseUrl(domain);
			const res = await fetch(`${apiBase}/secure/auth/qr?code=${encodeURIComponent(cleanPairCode)}`);
			if (!res.ok) {
				setErrorMsg('Koppelcode niet gevonden of verlopen.');
				return;
			}
			const data = await res.json();
			if (data?.token && data?.pairCode) {
				setPendingLookup({
					token: data.token,
					pairCode: data.pairCode,
					deviceInfo: data.deviceInfo || 'Crea-Accent Toestel',
					mode: data.mode,
				});
			} else {
				setErrorMsg('Geen wachtend toestel gevonden voor deze code.');
			}
		} catch {
			setErrorMsg('Kan de koppelserver niet bereiken.');
		} finally {
			setBusy(false);
		}
	};

	const handleApproveWaitingDevice = async () => {
		if (!pendingLookup) return;
		setBusy(true);
		setErrorMsg(null);

		try {
			const apiBase = resolveMobileApiBaseUrl(domain);
			const res = await fetch(`${apiBase}/secure/auth/qr`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'approve',
					token: pendingLookup.token,
					code: pendingLookup.pairCode,
				}),
			});
			if (!res.ok) {
				const approveUrl = resolveMobileTargetUrl(`https://account.crea-accent.app/login/approve?code=${encodeURIComponent(pendingLookup.pairCode)}`, domain);
				onOpenWorkspaceUrl(approveUrl);
				return;
			}
			setStatusMsg(`Toestel "${pendingLookup.deviceInfo}" is succesvol goedgekeurd!`);
			setPendingLookup(null);
			setCode('');
		} catch {
			setErrorMsg('Goedkeuren mislukt. Controleer of je bent aangemeld.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
			<View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
				<Text style={[styles.overline, { color: theme.accent }]}>SNEL KOPPELEN & QR LOGIN</Text>
				<Text style={[styles.title, { color: theme.text }]}>Mobiel Toestel Koppelen</Text>
				<Text style={[styles.subtitle, { color: theme.textMuted }]}>
					Voer de 6-teken koppelcode in vanuit Account → Toestellen op je Desktop om direct op deze telefoon in te loggen, of keur een wachtend Desktop-scherm goed.
				</Text>

				<TextInput
					value={code}
					onChangeText={(txt) => setCode(txt.toUpperCase())}
					placeholder="ABC-123"
					placeholderTextColor={theme.textMuted}
					autoCapitalize="characters"
					autoCorrect={false}
					style={[styles.codeInput, { backgroundColor: theme.recessed, color: theme.accent, borderColor: theme.accentBorder }]}
				/>

				{errorMsg && <Text style={[styles.errorText, { color: theme.accentRed }]}>{errorMsg}</Text>}
				{statusMsg && <Text style={[styles.successText, { color: theme.accentGreen }]}>{statusMsg}</Text>}

				{pendingLookup ? (
					<View style={[styles.confirmBox, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
						<Text style={[styles.confirmLabel, { color: theme.text }]}>Wachtend toestel gevonden: {pendingLookup.deviceInfo}</Text>
						<Text style={[styles.confirmCode, { color: theme.accent }]}>
							Code: {pendingLookup.pairCode.slice(0, 3)}-{pendingLookup.pairCode.slice(3)}
						</Text>
						<View style={styles.buttonRow}>
							<TouchableOpacity
								activeOpacity={0.8}
								onPress={() => setPendingLookup(null)}
								style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border, flex: 1 }]}
							>
								<Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuleren</Text>
							</TouchableOpacity>
							<TouchableOpacity activeOpacity={0.8} onPress={handleApproveWaitingDevice} disabled={busy} style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}>
								{busy ? <ActivityIndicator size="small" color="#090b09" /> : <Text style={styles.primaryBtnText}>Goedkeuren</Text>}
							</TouchableOpacity>
						</View>
					</View>
				) : (
					<View style={styles.actionsColumn}>
						<TouchableOpacity activeOpacity={0.8} onPress={handleSignInWithShareCode} disabled={busy} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
							<Text style={styles.primaryBtnText}>Inloggen op deze Telefoon met Code</Text>
						</TouchableOpacity>

						<TouchableOpacity
							activeOpacity={0.8}
							onPress={handleLookupWaitingDesktop}
							disabled={busy}
							style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
						>
							{busy ? <ActivityIndicator size="small" color={theme.accent} /> : <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Wachtend Toestel Goedkeuren</Text>}
						</TouchableOpacity>
					</View>
				)}
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingBottom: 32 },
	card: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 12 },
	overline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
	title: { fontSize: 20, fontWeight: '800' },
	subtitle: { fontSize: 12, lineHeight: 18 },
	codeInput: { borderRadius: 18, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: 4 },
	errorText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
	successText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
	actionsColumn: { gap: 10, marginTop: 4 },
	buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
	primaryBtn: { borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	primaryBtnText: { color: '#090b09', fontSize: 13, fontWeight: '800' },
	secondaryBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
	secondaryBtnText: { fontSize: 13, fontWeight: '700' },
	confirmBox: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 6 },
	confirmLabel: { fontSize: 13, fontWeight: '700' },
	confirmCode: { fontSize: 14, fontWeight: '800' },
});
