/** @format */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type MobileTabId } from '../metadata';
import { type MobileThemePalette } from '../theme';

interface BottomTabBarProps {
	activeTab: MobileTabId;
	onSelectTab: (tab: MobileTabId) => void;
	theme: MobileThemePalette;
	hapticEnabled: boolean;
	updateAvailable: boolean;
}

const TABS: Array<{ id: MobileTabId; label: string; glyph: string }> = [
	{ id: 'home', label: 'Vandaag', glyph: '☀' },
	{ id: 'dossiers', label: 'Dossiers', glyph: '📁' },
	{ id: 'workspace', label: 'Studio', glyph: '⚡' },
	{ id: 'pairing', label: 'Koppelen', glyph: '⌗' },
	{ id: 'settings', label: 'Opties', glyph: '⚙' },
];

export function BottomTabBar({ activeTab, onSelectTab, theme, hapticEnabled, updateAvailable }: BottomTabBarProps) {
	const handlePress = (tab: MobileTabId) => {
		if (hapticEnabled) {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
		}
		onSelectTab(tab);
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.foreground, borderTopColor: theme.border }]}>
			{TABS.map((tab) => {
				const isActive = activeTab === tab.id;
				const showBadge = tab.id === 'settings' && updateAvailable;

				return (
					<TouchableOpacity
						key={tab.id}
						activeOpacity={0.75}
						onPress={() => handlePress(tab.id)}
						accessibilityLabel={tab.label}
						style={[
							styles.tabButton,
							isActive && {
								backgroundColor: theme.accentSoft,
								borderColor: theme.accentBorder,
								borderWidth: 1,
							},
						]}
					>
						<View style={styles.iconRow}>
							<Text style={[styles.glyph, { color: isActive ? theme.accent : theme.textMuted }]}>{tab.glyph}</Text>
							{showBadge && <View style={[styles.badgeDot, { backgroundColor: theme.accentOrange }]} />}
						</View>
						<Text style={[styles.label, { color: isActive ? theme.text : theme.textMuted, fontWeight: isActive ? '700' : '500' }]}>{tab.label}</Text>
					</TouchableOpacity>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-around',
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderTopWidth: 1,
	},
	tabButton: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 8,
		marginHorizontal: 3,
		borderRadius: 20,
	},
	iconRow: {
		position: 'relative',
		alignItems: 'center',
		justifyContent: 'center',
	},
	glyph: {
		fontSize: 16,
		marginBottom: 2,
	},
	label: {
		fontSize: 11,
	},
	badgeDot: {
		position: 'absolute',
		top: -2,
		right: -8,
		width: 8,
		height: 8,
		borderRadius: 4,
	},
});
