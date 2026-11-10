/** @format */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getBiometricSupportInfo, verifyMobileBiometrics } from './biometrics';
import { BiometricShieldModal } from './components/BiometricShieldModal';
import { BottomTabBar } from './components/BottomTabBar';
import { DEFAULT_MOBILE_METADATA, getEffectiveDomain, loadMobileMetadata, type MobileMetadata, type MobileTabId, parseIncomingDeepLink } from './metadata';
import { configureMobileNotifications, scheduleDailyWerkbonReminder } from './notifications';
import { AgendaScreen } from './screens/AgendaScreen';
import { DossiersScreen } from './screens/DossiersScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MailScreen } from './screens/MailScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { getMobileTheme } from './theme';
import { checkMobileRelease, type MobileUpdateCheckResult } from './updater';

export default function App() {
	const [metadata, setMetadata] = useState<MobileMetadata>(DEFAULT_MOBILE_METADATA);
	const [activeTab, setActiveTab] = useState<MobileTabId>('home');
	const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
	const [pairCode, setPairCode] = useState<string | undefined>(undefined);
	const [shieldLocked, setShieldLocked] = useState<boolean>(false);
	const [biometricLabel, setBiometricLabel] = useState<string>('Face ID / Biometrie');
	const [updateInfo, setUpdateInfo] = useState<MobileUpdateCheckResult | null>(null);

	const theme = useMemo(() => getMobileTheme(metadata.themeMode, metadata.accentColor), [metadata.themeMode, metadata.accentColor]);

	const handleDeepLink = useCallback((rawUrl: string | null) => {
		if (!rawUrl) return;
		const parsed = parseIncomingDeepLink(rawUrl);
		if (!parsed) return;
		if (parsed.pairCode) {
			setPairCode(parsed.pairCode);
			setActiveTab('settings');
			return;
		}
		if (parsed.dossierId) {
			setSelectedDossierId(parsed.dossierId);
			setActiveTab('dossiers');
			return;
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
				handleDeepLink(initialUrl);
			}

			const releaseCheck = await checkMobileRelease(getEffectiveDomain(loaded));
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

	const handleOpenDossier = useCallback((dossierId: string) => {
		setSelectedDossierId(dossierId);
		setActiveTab('dossiers');
	}, []);

	return (
		<SafeAreaProvider>
			<SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
				<StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} backgroundColor={theme.background} />

				<View style={styles.mainContent}>
					{activeTab === 'home' && <HomeScreen metadata={metadata} theme={theme} onSelectTab={setActiveTab} onOpenDossier={handleOpenDossier} />}
					{activeTab === 'agenda' && <AgendaScreen metadata={metadata} theme={theme} onOpenDossier={handleOpenDossier} />}
					{activeTab === 'dossiers' && <DossiersScreen metadata={metadata} theme={theme} selectedDossierId={selectedDossierId} onSelectDossierId={setSelectedDossierId} />}
					{activeTab === 'mail' && <MailScreen metadata={metadata} theme={theme} onOpenDossier={handleOpenDossier} />}
					{activeTab === 'settings' && (
						<SettingsScreen metadata={metadata} onMetadataChange={setMetadata} updateInfo={updateInfo} onUpdateInfoChange={setUpdateInfo} initialPairCode={pairCode} theme={theme} />
					)}
				</View>

				<BottomTabBar
					activeTab={activeTab}
					onSelectTab={(tab) => {
						if (tab === 'dossiers' && activeTab === 'dossiers') {
							setSelectedDossierId(null);
						}
						setActiveTab(tab);
					}}
					theme={theme}
					hapticEnabled={metadata.hapticFeedback}
					updateAvailable={Boolean(updateInfo?.outdated)}
				/>

				<BiometricShieldModal visible={shieldLocked} biometricLabel={biometricLabel} onUnlock={() => void handleUnlockShield()} theme={theme} />
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
