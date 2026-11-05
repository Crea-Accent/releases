/** @format */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getBiometricSupportInfo, verifyMobileBiometrics } from './biometrics';
import { BiometricShieldModal } from './components/BiometricShieldModal';
import { BottomTabBar } from './components/BottomTabBar';
import { DEFAULT_MOBILE_METADATA, loadMobileMetadata, type MobileMetadata, type MobileTabId, parseIncomingDeepLink, saveMobileMetadata, WORKSPACE_SHORTCUT_URLS } from './metadata';
import { configureMobileNotifications, scheduleDailyWerkbonReminder } from './notifications';
import { DossiersScreen } from './screens/DossiersScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PairingScreen } from './screens/PairingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WorkspaceScreen } from './screens/WorkspaceScreen';
import { getMobileTheme } from './theme';
import { checkMobileRelease, type MobileUpdateCheckResult } from './updater';

export default function App() {
	const [metadata, setMetadata] = useState<MobileMetadata>(DEFAULT_MOBILE_METADATA);
	const [activeTab, setActiveTab] = useState<MobileTabId>('home');
	const [workspaceUrl, setWorkspaceUrl] = useState<string>(WORKSPACE_SHORTCUT_URLS.dashboard);
	const [pairCode, setPairCode] = useState<string | undefined>(undefined);
	const [shieldLocked, setShieldLocked] = useState<boolean>(false);
	const [biometricLabel, setBiometricLabel] = useState<string>('Face ID / Biometrie');
	const [updateInfo, setUpdateInfo] = useState<MobileUpdateCheckResult | null>(null);

	const theme = useMemo(() => getMobileTheme(metadata.themeMode, metadata.accentColor), [metadata.themeMode, metadata.accentColor]);

	const handleDeepLink = useCallback((rawUrl: string | null, currentDomain?: string) => {
		if (!rawUrl) return;
		const parsed = parseIncomingDeepLink(rawUrl, currentDomain);
		if (parsed.pairCode) {
			setPairCode(parsed.pairCode);
		}
		if (parsed.targetUrl) {
			setWorkspaceUrl(parsed.targetUrl);
		}
		setActiveTab(parsed.tab);
	}, []);

	const handleUnlockShield = useCallback(async () => {
		const ok = await verifyMobileBiometrics('Ontgrendel Crea-Accent Studio');
		if (ok) {
			setShieldLocked(false);
		}
	}, []);

	useEffect(() => {
		let mounted = true;

		(async () => {
			const loaded = await loadMobileMetadata();
			if (!mounted) return;
			setMetadata(loaded);
			setActiveTab(loaded.startupTab || 'home');
			if (loaded.lastWorkspaceUrl) {
				setWorkspaceUrl(loaded.lastWorkspaceUrl);
			}

			const bioInfo = await getBiometricSupportInfo();
			if (mounted) {
				setBiometricLabel(bioInfo.label);
				if (loaded.biometricLock) {
					setShieldLocked(true);
					const unlocked = await verifyMobileBiometrics('Ontgrendel Crea-Accent Studio');
					if (mounted && unlocked) setShieldLocked(false);
				}
			}

			if (loaded.pushNotifications) {
				await configureMobileNotifications();
			}
			if (loaded.dailyWorkOrderReminder) {
				await scheduleDailyWerkbonReminder(true);
			}

			const initialUrl = await Linking.getInitialURL();
			if (mounted && initialUrl) {
				handleDeepLink(initialUrl, loaded.domain);
			}

			// Background mobile-only release check (completely decoupled from desktop@* releases)
			const releaseCheck = await checkMobileRelease(loaded.domain);
			if (mounted) {
				setUpdateInfo(releaseCheck);
			}
		})();

		const urlSub = Linking.addEventListener('url', (event) => {
			handleDeepLink(event.url);
		});

		return () => {
			mounted = false;
			urlSub.remove();
		};
	}, [handleDeepLink]);

	useEffect(() => {
		const appStateSub = AppState.addEventListener('change', (nextState) => {
			if (nextState === 'background' && metadata.biometricLock) {
				setShieldLocked(true);
			}
		});
		return () => {
			appStateSub.remove();
		};
	}, [metadata.biometricLock]);

	const openWorkspaceUrl = useCallback((targetUrl: string) => {
		setWorkspaceUrl(targetUrl);
		setActiveTab('workspace');
		void saveMobileMetadata({ lastWorkspaceUrl: targetUrl });
	}, []);

	return (
		<SafeAreaProvider>
			<SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
				<StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} backgroundColor={theme.background} />

				<View style={styles.mainContent}>
					{activeTab === 'home' && <HomeScreen domain={metadata.domain} theme={theme} onOpenWorkspaceUrl={openWorkspaceUrl} />}
					{activeTab === 'dossiers' && <DossiersScreen domain={metadata.domain} theme={theme} onOpenWorkspaceUrl={openWorkspaceUrl} />}
					{activeTab === 'workspace' && (
						<WorkspaceScreen
							currentUrl={workspaceUrl}
							onUrlChange={(nextUrl) => {
								setWorkspaceUrl(nextUrl);
								void saveMobileMetadata({ lastWorkspaceUrl: nextUrl });
							}}
							metadata={metadata}
							onMetadataChange={setMetadata}
							onSwitchTab={setActiveTab}
							theme={theme}
						/>
					)}
					{activeTab === 'pairing' && <PairingScreen domain={metadata.domain} initialPairCode={pairCode} theme={theme} onOpenWorkspaceUrl={openWorkspaceUrl} />}
					{activeTab === 'settings' && <SettingsScreen metadata={metadata} onMetadataChange={setMetadata} updateInfo={updateInfo} onUpdateInfoChange={setUpdateInfo} theme={theme} />}
				</View>

				<BottomTabBar activeTab={activeTab} onSelectTab={setActiveTab} theme={theme} hapticEnabled={metadata.hapticFeedback} updateAvailable={Boolean(updateInfo?.outdated)} />

				<BiometricShieldModal visible={shieldLocked} biometricLabel={biometricLabel} onUnlock={handleUnlockShield} theme={theme} />
			</SafeAreaView>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	mainContent: {
		flex: 1,
	},
});
