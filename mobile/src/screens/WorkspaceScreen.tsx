/** @format */

import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildInjectedMobileBridgeScript, buildMobileUserAgent, handleWebViewBridgeMessage } from '../bridge';
import {
	detectExpoPackagerLanIp,
	getEffectiveDomain,
	isLocalHostOrIp,
	type MobileMetadata,
	type MobileTabId,
	type MobileWorkspaceShortcut,
	resolveMobileTargetUrl,
	saveMobileMetadata,
	WORKSPACE_SHORTCUT_URLS,
} from '../metadata';
import { type MobileThemePalette } from '../theme';
import { MOBILE_CLIENT_VERSION } from '../updater';

interface WorkspaceScreenProps {
	currentUrl: string;
	onUrlChange: (url: string) => void;
	metadata: MobileMetadata;
	onMetadataChange: (meta: MobileMetadata) => void;
	onSwitchTab: (tab: MobileTabId) => void;
	onOpenSheet: (sheet: 'pairing' | 'settings') => void;
	onLockShield: () => void;
	onUnlockShield: () => Promise<boolean>;
	updateAvailable?: boolean;
	theme: MobileThemePalette;
}

const DOCK_PILLS: Array<{ key: MobileWorkspaceShortcut; label: string }> = [
	{ key: 'dashboard', label: 'Studio' },
	{ key: 'agenda', label: 'Agenda' },
	{ key: 'dossiers', label: 'Dossiers' },
	{ key: 'mail', label: 'Mail' },
];

const QUICK_DESTINATIONS: Array<{ key: MobileWorkspaceShortcut; label: string; sub: string; badge: string }> = [
	{ key: 'dashboard', label: 'Studio Overzicht', sub: 'Dashboard, vandaag & KPI’s', badge: 'APP' },
	{ key: 'agenda', label: 'Agenda & Werkbonnen', sub: 'Planning, afspraken & dagtaken', badge: 'PLAN' },
	{ key: 'dossiers', label: 'Dossiers & Projecten', sub: 'Klanten, offertes, werven & Duotecno', badge: 'CRM' },
	{ key: 'projectMail', label: 'Project Mail', sub: 'Dossiergebonden e-mails & bijlagen', badge: 'MAIL' },
	{ key: 'mail', label: 'Mailbox', sub: 'Persoonlijke & gedeelde inbox', badge: 'INBOX' },
	{ key: 'stock', label: 'Voorraad & Magazijn', sub: 'Artikelen, scanning & bestellingen', badge: 'ERP' },
	{ key: 'energy', label: 'Energie & Monitoring', sub: 'Verbruik, opbrengst & sturing', badge: 'LIVE' },
	{ key: 'files', label: 'NAS & Bestanden', sub: 'Projectmappen, schema’s & documenten', badge: 'NAS' },
	{ key: 'account', label: 'Account & Voorkeuren', sub: 'Profiel, toestellen & beveiliging', badge: 'ID' },
	{ key: 'info', label: 'Support, Tickets & Roadmap', sub: 'Meldingen, suggesties & systeemstatus', badge: 'INFO' },
	{ key: 'admin', label: 'Administratie', sub: 'Gebruikers, rollen & vertalingen', badge: 'ADMIN' },
	{ key: 'portal', label: 'Klantenportaal', sub: 'Oplevering & klantendocumenten', badge: 'PORTAL' },
];

export function WorkspaceScreen({ currentUrl, onUrlChange, metadata, onMetadataChange, onSwitchTab, onOpenSheet, onLockShield, onUnlockShield, updateAvailable, theme }: WorkspaceScreenProps) {
	const webViewRef = useRef<WebView | null>(null);
	const [canGoBack, setCanGoBack] = useState(false);
	const [loading, setLoading] = useState(true);
	const [initialBootComplete, setInitialBootComplete] = useState(false);
	const [bootStatusText, setBootStatusText] = useState('Connecting to Crea-Accent Studio...');
	const [hasError, setHasError] = useState(false);
	const [quickSheetOpen, setQuickSheetOpen] = useState(false);

	const pulseAnim = useRef(new Animated.Value(0.88)).current;

	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulseAnim, { toValue: 1.05, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
				Animated.timing(pulseAnim, { toValue: 0.88, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
			])
		);
		loop.start();
		return () => loop.stop();
	}, [pulseAnim]);

	const effectiveDomain = useMemo(() => getEffectiveDomain(metadata), [metadata]);
	const isLocalMode = useMemo(() => isLocalHostOrIp(effectiveDomain), [effectiveDomain]);
	const detectedLanIp = useMemo(() => detectExpoPackagerLanIp() || metadata.lanHost || '172.16.10.179', [metadata.lanHost]);

	const resolvedUri = useMemo(() => resolveMobileTargetUrl(currentUrl, effectiveDomain), [currentUrl, effectiveDomain]);
	const userAgent = useMemo(() => buildMobileUserAgent(), []);
	const injectedScript = useMemo(() => buildInjectedMobileBridgeScript(metadata), [metadata]);
	const [observedUrl, setObservedUrl] = useState<string>(resolvedUri);

	// Pre-warm both app (4004) and account/api (4003) servers when booting in Local Dev LAN mode,
	// and automatically fall back to Live Cloud (crea-accent.app) if port 4004 is not reachable in 'auto' mode.
	useEffect(() => {
		let cancelled = false;

		if (!isLocalMode) {
			setBootStatusText('Connecting to Crea-Accent Studio...');
			return () => {
				cancelled = true;
			};
		}

		const appVersionUrl = `${resolveMobileTargetUrl('https://app.crea-accent.app', effectiveDomain).replace(/\/$/, '')}/api/version`;
		const accountVersionUrl = `${resolveMobileTargetUrl('https://account.crea-accent.app', effectiveDomain).replace(/\/$/, '')}/api/version`;

		setBootStatusText(`Checking Local Dev Studio (${effectiveDomain}:4004)...`);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 2200);

		fetch(appVersionUrl, { signal: controller.signal })
			.then((res) => {
				clearTimeout(timer);
				if (cancelled) return;
				if (res.ok) {
					setBootStatusText('Loading Local Dev Studio...');
					void fetch(accountVersionUrl).catch(() => {});
				} else if (metadata.connectionMode === 'auto') {
					setBootStatusText('Switching to Live Cloud (crea-accent.app)...');
					void saveMobileMetadata({ connectionMode: 'cloud', autoSwitchLocalLan: false, domain: 'crea-accent.app' }).then((updated) => {
						if (!cancelled) onMetadataChange(updated);
					});
				}
			})
			.catch(() => {
				clearTimeout(timer);
				if (cancelled) return;
				if (metadata.connectionMode === 'auto') {
					setBootStatusText('Switching to Live Cloud (crea-accent.app)...');
					void saveMobileMetadata({ connectionMode: 'cloud', autoSwitchLocalLan: false, domain: 'crea-accent.app' }).then((updated) => {
						if (!cancelled) onMetadataChange(updated);
					});
				}
			});

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [effectiveDomain, isLocalMode, metadata.connectionMode, onMetadataChange]);

	const triggerHaptic = () => {
		if (metadata.hapticFeedback !== false) {
			void Haptics.selectionAsync().catch(() => {});
		}
	};

	const sendToWebView = (payload: { requestId?: string | null; event?: string; data?: any }) => {
		const script = `window.__creaMobileReceive && window.__creaMobileReceive(${JSON.stringify(payload)}); true;`;
		webViewRef.current?.injectJavaScript(script);
	};

	const onMessage = (event: WebViewMessageEvent) => {
		void handleWebViewBridgeMessage(event.nativeEvent.data, {
			sendToWebView,
			onSwitchTab,
			onOpenSheet: (sheet) => {
				if (sheet === 'quick') {
					setQuickSheetOpen(true);
				} else {
					setQuickSheetOpen(false);
					onOpenSheet(sheet);
				}
			},
			onLockShield,
			onUnlockShield,
			onNavigateUrl: (url) => {
				setHasError(false);
				setObservedUrl(url);
				onUrlChange(url);
			},
			onReloadWebView: () => {
				setHasError(false);
				webViewRef.current?.reload();
			},
			onMetadataChanged: onMetadataChange,
		});
	};

	const onNavChange = (navState: WebViewNavigation) => {
		setCanGoBack(Boolean(navState.canGoBack));
		if (navState.url && /^https?:\/\//i.test(navState.url)) {
			setObservedUrl(navState.url);
			if (metadata.rememberLastPage !== false) {
				void saveMobileMetadata({ lastWorkspaceUrl: navState.url });
			}
		}
	};

	const switchConnectionEnvironment = async (mode: 'cloud' | 'lan') => {
		triggerHaptic();
		setHasError(false);
		setInitialBootComplete(false);
		const targetDomain = mode === 'lan' ? detectedLanIp : 'crea-accent.app';
		const updated = await saveMobileMetadata({
			connectionMode: mode,
			autoSwitchLocalLan: mode === 'lan',
			domain: targetDomain,
		});
		onMetadataChange(updated);
		const nextUrl = resolveMobileTargetUrl(currentUrl, targetDomain);
		setObservedUrl(nextUrl);
		setQuickSheetOpen(false);
	};

	const toggleDockCollapsed = async () => {
		triggerHaptic();
		const updated = await saveMobileMetadata({ dockCollapsed: !metadata.dockCollapsed });
		onMetadataChange(updated);
	};

	const navigateToShortcut = (key: MobileWorkspaceShortcut) => {
		triggerHaptic();
		setHasError(false);
		const target = WORKSPACE_SHORTCUT_URLS[key];
		const nextResolved = resolveMobileTargetUrl(target, effectiveDomain);
		setObservedUrl(nextResolved);
		onUrlChange(target);
		setQuickSheetOpen(false);
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			{/* Full-screen Studio WebView */}
			{!hasError && (
				<WebView
					ref={webViewRef}
					source={{ uri: resolvedUri }}
					style={styles.webview}
					userAgent={userAgent}
					injectedJavaScriptBeforeContentLoaded={injectedScript}
					onMessage={onMessage}
					onNavigationStateChange={onNavChange}
					onLoadStart={() => setLoading(true)}
					onLoadEnd={() => {
						setLoading(false);
						setInitialBootComplete(true);
					}}
					onError={() => {
						setLoading(false);
						setHasError(true);
					}}
					pullToRefreshEnabled
					allowsBackForwardNavigationGestures
					sharedCookiesEnabled
					thirdPartyCookiesEnabled
					domStorageEnabled
					javaScriptEnabled
				/>
			)}

			{/* Desktop-style Splash / Connection Overlay during Initial Boot or Error */}
			{(!initialBootComplete || hasError) && (
				<View style={[styles.splashOverlay, { backgroundColor: theme.background }]}>
					<View style={styles.splashCenter}>
						<Animated.View
							style={[
								styles.logoBadge,
								{
									backgroundColor: theme.accentSoft,
									borderColor: theme.accentBorder,
									transform: [{ scale: pulseAnim }],
								},
							]}
						>
							<View style={[styles.logoDot, { backgroundColor: theme.accent }]} />
							<Text style={[styles.logoMonogram, { color: theme.accent }]}>CA</Text>
						</Animated.View>

						<Text style={[styles.splashBrand, { color: theme.text }]}>crea-accent</Text>
						<Text style={[styles.splashSubBrand, { color: theme.accent }]}>STUDIO ON-THE-GO · v{MOBILE_CLIENT_VERSION}</Text>

						<View style={[styles.envBadge, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
							<View style={[styles.envDot, { backgroundColor: isLocalMode ? theme.accentOrange : theme.accentGreen }]} />
							<Text style={[styles.envBadgeText, { color: theme.textMuted }]}>{isLocalMode ? `Local Dev LAN (${effectiveDomain}:4004)` : `Live Cloud (${effectiveDomain})`}</Text>
						</View>

						{hasError ? (
							<View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
								<Text style={[styles.errorTitle, { color: theme.text }]}>Verbinding met Studio onderbroken</Text>
								<Text style={[styles.errorSub, { color: theme.textMuted }]}>
									Kan {resolvedUri} niet bereiken. Controleer of de lokale ontwikkelserver draait of schakel direct over naar de Live Cloud.
								</Text>
								<View style={styles.errorActions}>
									<TouchableOpacity
										activeOpacity={0.85}
										onPress={() => {
											setHasError(false);
											setLoading(true);
											webViewRef.current?.reload();
										}}
										style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
									>
										<Text style={styles.primaryBtnText}>Opnieuw Verbinden</Text>
									</TouchableOpacity>

									{isLocalMode ? (
										<TouchableOpacity
											activeOpacity={0.85}
											onPress={() => void switchConnectionEnvironment('cloud')}
											style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.accentBorder }]}
										>
											<Text style={[styles.secondaryBtnText, { color: theme.accent }]}>Schakel naar Live Cloud (crea-accent.app)</Text>
										</TouchableOpacity>
									) : (
										<TouchableOpacity
											activeOpacity={0.85}
											onPress={() => void switchConnectionEnvironment('lan')}
											style={[styles.secondaryBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
										>
											<Text style={[styles.secondaryBtnText, { color: theme.text }]}>Schakel naar Local Dev LAN ({detectedLanIp})</Text>
										</TouchableOpacity>
									)}
								</View>
							</View>
						) : (
							<View style={styles.bootStatusBox}>
								<ActivityIndicator size="small" color={theme.accent} />
								<Text style={[styles.bootStatusText, { color: theme.textMuted }]}>{bootStatusText}</Text>

								{isLocalMode && (
									<TouchableOpacity
										activeOpacity={0.8}
										onPress={() => void switchConnectionEnvironment('cloud')}
										style={[styles.switchCloudChip, { backgroundColor: theme.recessed, borderColor: theme.border }]}
									>
										<Text style={[styles.switchCloudChipText, { color: theme.accent }]}>Open Live Cloud i.p.v. Local LAN →</Text>
									</TouchableOpacity>
								)}
							</View>
						)}
					</View>
				</View>
			)}

			{/* Sleek Collapsible On-The-Go Floating Dock */}
			{initialBootComplete && !hasError && (
				<View pointerEvents="box-none" style={styles.dockWrapper}>
					{metadata.dockCollapsed ? (
						<View style={styles.collapsedDockRow}>
							<TouchableOpacity
								activeOpacity={0.85}
								onPress={() => {
									triggerHaptic();
									setQuickSheetOpen(true);
								}}
								style={[styles.collapsedFab, { backgroundColor: theme.cardElevated, borderColor: theme.accentBorder }]}
							>
								<View style={[styles.liveIndicator, { backgroundColor: isLocalMode ? theme.accentOrange : theme.accent }]} />
								<Text style={[styles.collapsedFabText, { color: theme.text }]}>Studio</Text>
								{updateAvailable && <View style={[styles.updateDot, { backgroundColor: theme.accentGreen }]} />}
							</TouchableOpacity>
							<TouchableOpacity
								activeOpacity={0.85}
								onPress={() => void toggleDockCollapsed()}
								style={[styles.expandBtn, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}
							>
								<Text style={[styles.expandBtnText, { color: theme.accent }]}>⌃</Text>
							</TouchableOpacity>
						</View>
					) : (
						<View style={[styles.floatingDock, { backgroundColor: theme.cardElevated, borderColor: theme.border }]}>
							{canGoBack && (
								<TouchableOpacity
									activeOpacity={0.8}
									onPress={() => {
										triggerHaptic();
										webViewRef.current?.goBack();
									}}
									style={[styles.dockIconBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
								>
									<Text style={[styles.dockIconText, { color: theme.text }]}>←</Text>
								</TouchableOpacity>
							)}

							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dockPillsRow}>
								{DOCK_PILLS.map((pill) => {
									const targetUri = resolveMobileTargetUrl(WORKSPACE_SHORTCUT_URLS[pill.key], effectiveDomain);
									const activeUri = observedUrl || resolvedUri;
									const isActive =
										pill.key === 'dashboard' ? activeUri.replace(/\/$/, '') === targetUri.replace(/\/$/, '') || activeUri.includes('?tab=home') : activeUri.startsWith(targetUri);

									return (
										<TouchableOpacity
											key={pill.key}
											activeOpacity={0.8}
											onPress={() => navigateToShortcut(pill.key)}
											style={[
												styles.dockPill,
												{
													backgroundColor: isActive ? theme.accentSoft : theme.recessed,
													borderColor: isActive ? theme.accentBorder : theme.border,
												},
											]}
										>
											<Text style={[styles.dockPillText, { color: isActive ? theme.accent : theme.textMuted }]}>{pill.label}</Text>
										</TouchableOpacity>
									);
								})}
							</ScrollView>

							<TouchableOpacity
								activeOpacity={0.85}
								onPress={() => {
									triggerHaptic();
									setQuickSheetOpen(true);
								}}
								style={[styles.dockActionBtn, { backgroundColor: theme.accent }]}
							>
								<Text style={styles.dockActionBtnText}>⚡</Text>
								{updateAvailable && <View style={[styles.updateDotCorner, { backgroundColor: theme.accentGreen }]} />}
							</TouchableOpacity>

							<TouchableOpacity
								activeOpacity={0.8}
								onPress={() => void toggleDockCollapsed()}
								style={[styles.dockIconBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
							>
								<Text style={[styles.dockIconText, { color: theme.textMuted }]}>⌄</Text>
							</TouchableOpacity>
						</View>
					)}
				</View>
			)}

			{/* On-The-Go Command & Environment Sheet */}
			<Modal visible={quickSheetOpen} transparent animationType="fade" onRequestClose={() => setQuickSheetOpen(false)}>
				<View style={styles.sheetBackdrop}>
					<TouchableOpacity style={styles.sheetDismissArea} activeOpacity={1} onPress={() => setQuickSheetOpen(false)} />

					<View style={[styles.sheetContainer, { backgroundColor: theme.foreground, borderColor: theme.border }]}>
						<View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

						<View style={styles.sheetHeaderRow}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.sheetOverline, { color: theme.accent }]}>CREA-ACCENT STUDIO · ON-THE-GO</Text>
								<Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={1}>
									Snel Schakelen & Acties
								</Text>
							</View>
							<TouchableOpacity
								activeOpacity={0.8}
								onPress={() => setQuickSheetOpen(false)}
								style={[styles.closeSheetBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
							>
								<Text style={[styles.closeSheetBtnText, { color: theme.textMuted }]}>✕</Text>
							</TouchableOpacity>
						</View>

						<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
							{/* Environment Toggle: Local Dev LAN vs. Live Cloud */}
							<View style={[styles.envSwitchCard, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
								<View style={styles.envSwitchHeader}>
									<Text style={[styles.envSwitchLabel, { color: theme.text }]}>Verbindingsomgeving</Text>
									<Text style={[styles.envSwitchHost, { color: theme.accent }]} numberOfLines={1}>
										{effectiveDomain}
									</Text>
								</View>
								<View style={styles.envSwitchButtons}>
									<TouchableOpacity
										activeOpacity={0.85}
										onPress={() => void switchConnectionEnvironment('cloud')}
										style={[
											styles.envModeBtn,
											{
												backgroundColor: !isLocalMode ? theme.accent : theme.card,
												borderColor: !isLocalMode ? theme.accent : theme.border,
											},
										]}
									>
										<Text style={[styles.envModeBtnText, { color: !isLocalMode ? '#090b09' : theme.text }]}>☁️ Live Cloud</Text>
									</TouchableOpacity>

									<TouchableOpacity
										activeOpacity={0.85}
										onPress={() => void switchConnectionEnvironment('lan')}
										style={[
											styles.envModeBtn,
											{
												backgroundColor: isLocalMode ? theme.accent : theme.card,
												borderColor: isLocalMode ? theme.accent : theme.border,
											},
										]}
									>
										<Text style={[styles.envModeBtnText, { color: isLocalMode ? '#090b09' : theme.text }]}>💻 Dev LAN ({detectedLanIp})</Text>
									</TouchableOpacity>
								</View>
							</View>

							{/* Quick On-The-Go Actions Row */}
							<View style={styles.quickToolsRow}>
								<TouchableOpacity
									activeOpacity={0.8}
									onPress={() => {
										triggerHaptic();
										setQuickSheetOpen(false);
										onOpenSheet('pairing');
									}}
									style={[styles.quickToolCard, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}
								>
									<Text style={[styles.quickToolTitle, { color: theme.accent }]}>📲 Koppelen</Text>
									<Text style={[styles.quickToolSub, { color: theme.textMuted }]}>6-cijfer / QR login</Text>
								</TouchableOpacity>

								<TouchableOpacity
									activeOpacity={0.8}
									onPress={() => {
										triggerHaptic();
										setQuickSheetOpen(false);
										webViewRef.current?.reload();
									}}
									style={[styles.quickToolCard, { backgroundColor: theme.card, borderColor: theme.border }]}
								>
									<Text style={[styles.quickToolTitle, { color: theme.text }]}>↻ Herladen</Text>
									<Text style={[styles.quickToolSub, { color: theme.textMuted }]}>Vernieuw weergave</Text>
								</TouchableOpacity>

								<TouchableOpacity
									activeOpacity={0.8}
									onPress={() => {
										triggerHaptic();
										setQuickSheetOpen(false);
										void Share.share({
											title: 'Crea-Accent Studio',
											message: observedUrl || resolvedUri,
											url: observedUrl || resolvedUri,
										});
									}}
									style={[styles.quickToolCard, { backgroundColor: theme.card, borderColor: theme.border }]}
								>
									<Text style={[styles.quickToolTitle, { color: theme.text }]}>📤 Delen</Text>
									<Text style={[styles.quickToolSub, { color: theme.textMuted }]}>Stuur huidige link</Text>
								</TouchableOpacity>

								<TouchableOpacity
									activeOpacity={0.8}
									onPress={() => {
										triggerHaptic();
										setQuickSheetOpen(false);
										onOpenSheet('settings');
									}}
									style={[styles.quickToolCard, { backgroundColor: theme.card, borderColor: theme.border }]}
								>
									<Text style={[styles.quickToolTitle, { color: theme.text }]}>⚙️ App Opties</Text>
									<Text style={[styles.quickToolSub, { color: updateAvailable ? theme.accentGreen : theme.textMuted }]}>
										{updateAvailable ? 'Update beschikbaar!' : `v${MOBILE_CLIENT_VERSION}`}
									</Text>
								</TouchableOpacity>
							</View>

							{/* Studio Views Grid */}
							<Text style={[styles.sectionHeader, { color: theme.textMuted }]}>STUDIO ONDERDELEN</Text>
							<View style={styles.destinationsList}>
								{QUICK_DESTINATIONS.map((item) => {
									const targetUri = resolveMobileTargetUrl(WORKSPACE_SHORTCUT_URLS[item.key], effectiveDomain);
									const activeUri = observedUrl || resolvedUri;
									const isActive = item.key === 'dashboard' ? activeUri.replace(/\/$/, '') === targetUri.replace(/\/$/, '') : activeUri.startsWith(targetUri);

									return (
										<TouchableOpacity
											key={item.key}
											activeOpacity={0.8}
											onPress={() => navigateToShortcut(item.key)}
											style={[
												styles.destCard,
												{
													backgroundColor: isActive ? theme.accentSoft : theme.card,
													borderColor: isActive ? theme.accentBorder : theme.border,
												},
											]}
										>
											<View style={{ flex: 1, gap: 2 }}>
												<Text style={[styles.destLabel, { color: isActive ? theme.accent : theme.text }]}>{item.label}</Text>
												<Text style={[styles.destSub, { color: theme.textMuted }]}>{item.sub}</Text>
											</View>
											<View style={[styles.destBadge, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
												<Text style={[styles.destBadgeText, { color: theme.accent }]}>{item.badge}</Text>
											</View>
										</TouchableOpacity>
									);
								})}
							</View>
						</ScrollView>
					</View>
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	webview: { flex: 1 },
	splashOverlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24,
		zIndex: 20,
	},
	splashCenter: {
		width: '100%',
		maxWidth: 380,
		alignItems: 'center',
		gap: 10,
	},
	logoBadge: {
		width: 84,
		height: 84,
		borderRadius: 28,
		borderWidth: 1.5,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 6,
	},
	logoDot: {
		position: 'absolute',
		top: 14,
		right: 14,
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	logoMonogram: {
		fontSize: 30,
		fontWeight: '900',
		letterSpacing: 1,
	},
	splashBrand: {
		fontSize: 26,
		fontWeight: '900',
		letterSpacing: 0.4,
	},
	splashSubBrand: {
		fontSize: 11,
		fontWeight: '800',
		letterSpacing: 1.5,
	},
	envBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: 1,
		marginTop: 4,
	},
	envDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	envBadgeText: {
		fontSize: 11,
		fontWeight: '700',
	},
	bootStatusBox: {
		marginTop: 18,
		alignItems: 'center',
		gap: 10,
	},
	bootStatusText: {
		fontSize: 12,
		fontWeight: '600',
	},
	switchCloudChip: {
		marginTop: 8,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
	},
	switchCloudChipText: {
		fontSize: 12,
		fontWeight: '700',
	},
	errorCard: {
		width: '100%',
		marginTop: 14,
		padding: 20,
		borderRadius: 24,
		borderWidth: 1,
		alignItems: 'center',
		gap: 10,
	},
	errorTitle: {
		fontSize: 16,
		fontWeight: '800',
		textAlign: 'center',
	},
	errorSub: {
		fontSize: 12,
		textAlign: 'center',
		lineHeight: 18,
	},
	errorActions: {
		width: '100%',
		gap: 8,
		marginTop: 6,
	},
	primaryBtn: {
		width: '100%',
		paddingVertical: 13,
		paddingHorizontal: 16,
		borderRadius: 16,
		alignItems: 'center',
	},
	primaryBtnText: {
		color: '#090b09',
		fontSize: 13,
		fontWeight: '800',
	},
	secondaryBtn: {
		width: '100%',
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 16,
		borderWidth: 1,
		alignItems: 'center',
	},
	secondaryBtnText: {
		fontSize: 12,
		fontWeight: '700',
	},
	dockWrapper: {
		position: 'absolute',
		left: 12,
		right: 12,
		bottom: 10,
		zIndex: 10,
	},
	floatingDock: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 8,
		paddingVertical: 7,
		borderRadius: 24,
		borderWidth: 1,
		gap: 6,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.28,
		shadowRadius: 12,
		elevation: 8,
	},
	dockIconBtn: {
		width: 34,
		height: 34,
		borderRadius: 17,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dockIconText: {
		fontSize: 15,
		fontWeight: '800',
	},
	dockPillsRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 2,
	},
	dockPill: {
		paddingHorizontal: 13,
		paddingVertical: 7,
		borderRadius: 16,
		borderWidth: 1,
	},
	dockPillText: {
		fontSize: 12,
		fontWeight: '700',
	},
	dockActionBtn: {
		width: 36,
		height: 34,
		borderRadius: 17,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dockActionBtnText: {
		fontSize: 15,
		color: '#090b09',
		fontWeight: '900',
	},
	collapsedDockRow: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		alignItems: 'center',
		gap: 6,
	},
	collapsedFab: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 7,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.25,
		shadowRadius: 8,
		elevation: 6,
	},
	liveIndicator: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	collapsedFabText: {
		fontSize: 12,
		fontWeight: '800',
	},
	expandBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	expandBtnText: {
		fontSize: 14,
		fontWeight: '900',
	},
	updateDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	updateDotCorner: {
		position: 'absolute',
		top: 3,
		right: 3,
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	sheetBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.62)',
		justifyContent: 'flex-end',
	},
	sheetDismissArea: {
		flex: 1,
	},
	sheetContainer: {
		maxHeight: '84%',
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: 1,
		paddingHorizontal: 18,
		paddingTop: 10,
		paddingBottom: 26,
	},
	sheetHandle: {
		width: 42,
		height: 4,
		borderRadius: 2,
		alignSelf: 'center',
		marginBottom: 12,
	},
	sheetHeaderRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 14,
	},
	sheetOverline: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 1.2,
	},
	sheetTitle: {
		fontSize: 19,
		fontWeight: '800',
	},
	closeSheetBtn: {
		width: 34,
		height: 34,
		borderRadius: 17,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	closeSheetBtnText: {
		fontSize: 14,
		fontWeight: '800',
	},
	sheetScrollContent: {
		gap: 14,
		paddingBottom: 16,
	},
	envSwitchCard: {
		borderRadius: 20,
		borderWidth: 1,
		padding: 14,
		gap: 10,
	},
	envSwitchHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	envSwitchLabel: {
		fontSize: 12,
		fontWeight: '800',
	},
	envSwitchHost: {
		fontSize: 11,
		fontWeight: '700',
	},
	envSwitchButtons: {
		flexDirection: 'row',
		gap: 8,
	},
	envModeBtn: {
		flex: 1,
		paddingVertical: 10,
		paddingHorizontal: 10,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: 'center',
	},
	envModeBtnText: {
		fontSize: 12,
		fontWeight: '800',
	},
	quickToolsRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
	},
	quickToolCard: {
		width: '48.5%',
		borderRadius: 18,
		borderWidth: 1,
		padding: 12,
		gap: 2,
	},
	quickToolTitle: {
		fontSize: 13,
		fontWeight: '800',
	},
	quickToolSub: {
		fontSize: 11,
		fontWeight: '600',
	},
	sectionHeader: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 1.2,
		marginTop: 4,
	},
	destinationsList: {
		gap: 8,
	},
	destCard: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 10,
	},
	destLabel: {
		fontSize: 14,
		fontWeight: '800',
	},
	destSub: {
		fontSize: 11,
	},
	destBadge: {
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 10,
		borderWidth: 1,
	},
	destBadgeText: {
		fontSize: 10,
		fontWeight: '800',
		letterSpacing: 0.6,
	},
});
