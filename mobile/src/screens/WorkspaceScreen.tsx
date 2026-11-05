/** @format */

import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { buildInjectedMobileBridgeScript, buildMobileUserAgent, handleWebViewBridgeMessage } from '../bridge';
import { type MobileMetadata, type MobileTabId, type MobileWorkspaceShortcut, resolveMobileTargetUrl, WORKSPACE_SHORTCUT_URLS } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface WorkspaceScreenProps {
	currentUrl: string;
	onUrlChange: (url: string) => void;
	metadata: MobileMetadata;
	onMetadataChange: (meta: MobileMetadata) => void;
	onSwitchTab: (tab: MobileTabId) => void;
	theme: MobileThemePalette;
}

const PILLS: Array<{ key: MobileWorkspaceShortcut; label: string }> = [
	{ key: 'dashboard', label: 'Vandaag' },
	{ key: 'dossiers', label: 'Dossiers' },
	{ key: 'agenda', label: 'Agenda' },
	{ key: 'projectMail', label: 'Project Mail' },
	{ key: 'mail', label: 'Mailbox' },
	{ key: 'account', label: 'Account' },
];

export function WorkspaceScreen({ currentUrl, onUrlChange, metadata, onMetadataChange, onSwitchTab, theme }: WorkspaceScreenProps) {
	const webViewRef = useRef<WebView | null>(null);
	const [canGoBack, setCanGoBack] = useState(false);
	const [loading, setLoading] = useState(false);
	const [hasError, setHasError] = useState(false);

	const resolvedUri = useMemo(() => resolveMobileTargetUrl(currentUrl, metadata.domain), [currentUrl, metadata.domain]);
	const userAgent = useMemo(() => buildMobileUserAgent(), []);
	const injectedScript = useMemo(() => buildInjectedMobileBridgeScript(metadata), [metadata]);

	const sendToWebView = (payload: { requestId?: string | null; event?: string; data?: any }) => {
		const script = `window.__creaMobileReceive && window.__creaMobileReceive(${JSON.stringify(payload)}); true;`;
		webViewRef.current?.injectJavaScript(script);
	};

	const onMessage = (event: WebViewMessageEvent) => {
		void handleWebViewBridgeMessage(event.nativeEvent.data, {
			sendToWebView,
			onSwitchTab,
			onMetadataChanged: onMetadataChange,
		});
	};

	const onNavChange = (navState: WebViewNavigation) => {
		setCanGoBack(Boolean(navState.canGoBack));
		if (navState.url && /^https?:\/\//i.test(navState.url)) {
			onUrlChange(navState.url);
		}
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.background }]}>
			{/* Top Pill Toolbar */}
			<View style={[styles.toolbar, { backgroundColor: theme.foreground, borderBottomColor: theme.border }]}>
				{canGoBack && (
					<TouchableOpacity activeOpacity={0.75} onPress={() => webViewRef.current?.goBack()} style={[styles.navBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}>
						<Text style={[styles.navBtnText, { color: theme.text }]}>←</Text>
					</TouchableOpacity>
				)}

				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
					{PILLS.map((pill) => {
						const target = resolveMobileTargetUrl(WORKSPACE_SHORTCUT_URLS[pill.key], metadata.domain);
						const isActive = resolvedUri.startsWith(target);
						return (
							<TouchableOpacity
								key={pill.key}
								activeOpacity={0.8}
								onPress={() => {
									setHasError(false);
									onUrlChange(WORKSPACE_SHORTCUT_URLS[pill.key]);
								}}
								style={[
									styles.pill,
									{
										backgroundColor: isActive ? theme.accentSoft : theme.recessed,
										borderColor: isActive ? theme.accentBorder : theme.border,
									},
								]}
							>
								<Text style={[styles.pillText, { color: isActive ? theme.accent : theme.textMuted }]}>{pill.label}</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>

				<TouchableOpacity
					activeOpacity={0.75}
					onPress={() => {
						setHasError(false);
						webViewRef.current?.reload();
					}}
					style={[styles.navBtn, { backgroundColor: theme.recessed, borderColor: theme.border }]}
				>
					<Text style={[styles.navBtnText, { color: theme.accent }]}>{loading ? '…' : '↻'}</Text>
				</TouchableOpacity>
			</View>

			{hasError ? (
				<View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
					<Text style={[styles.errorTitle, { color: theme.text }]}>Verbinding met Studio onderbroken</Text>
					<Text style={[styles.errorSub, { color: theme.textMuted }]}>Kan {resolvedUri} momenteel niet bereiken. Controleer je internet- of LAN-verbinding.</Text>
					<TouchableOpacity
						activeOpacity={0.8}
						onPress={() => {
							setHasError(false);
							webViewRef.current?.reload();
						}}
						style={[styles.retryBtn, { backgroundColor: theme.accent }]}
					>
						<Text style={styles.retryBtnText}>Opnieuw Verbinden</Text>
					</TouchableOpacity>
				</View>
			) : (
				<WebView
					ref={webViewRef}
					source={{ uri: resolvedUri }}
					style={styles.webview}
					userAgent={userAgent}
					injectedJavaScriptBeforeContentLoaded={injectedScript}
					onMessage={onMessage}
					onNavigationStateChange={onNavChange}
					onLoadStart={() => setLoading(true)}
					onLoadEnd={() => setLoading(false)}
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
					startInLoadingState
					renderLoading={() => (
						<View style={[styles.loadingOverlay, { backgroundColor: theme.background }]}>
							<ActivityIndicator size="large" color={theme.accent} />
						</View>
					)}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, gap: 8 },
	navBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
	navBtnText: { fontSize: 15, fontWeight: '800' },
	pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
	pillText: { fontSize: 12, fontWeight: '700' },
	webview: { flex: 1 },
	loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
	errorCard: { margin: 20, padding: 24, borderRadius: 24, borderWidth: 1, alignItems: 'center', gap: 10 },
	errorTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
	errorSub: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
	retryBtn: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16 },
	retryBtnText: { color: '#090b09', fontSize: 13, fontWeight: '800' },
});
