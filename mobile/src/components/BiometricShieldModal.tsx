/** @format */

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type MobileThemePalette } from '../theme';

interface BiometricShieldModalProps {
	visible: boolean;
	biometricLabel: string;
	onUnlock: () => void;
	theme: MobileThemePalette;
}

export function BiometricShieldModal({ visible, biometricLabel, onUnlock, theme }: BiometricShieldModalProps) {
	return (
		<Modal visible={visible} transparent animationType="fade">
			<View style={[styles.backdrop, { backgroundColor: theme.background }]}>
				<View style={[styles.card, { backgroundColor: theme.cardElevated, borderColor: theme.accentBorder }]}>
					<View style={[styles.iconBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
						<Text style={[styles.iconText, { color: theme.accent }]}>🔒</Text>
					</View>
					<Text style={[styles.title, { color: theme.text }]}>Privacy Shield Vergrendeld</Text>
					<Text style={[styles.subtitle, { color: theme.textMuted }]}>
						Crea-Accent Studio Mobile is beveiligd. Gebruik {biometricLabel} om je dossiers, werkbonnen en agenda te ontgrendelen.
					</Text>
					<TouchableOpacity activeOpacity={0.8} onPress={onUnlock} style={[styles.unlockButton, { backgroundColor: theme.accent }]}>
						<Text style={styles.unlockButtonText}>Ontgrendelen met {biometricLabel}</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 24,
	},
	card: {
		width: '100%',
		maxWidth: 380,
		borderRadius: 28,
		borderWidth: 1,
		padding: 24,
		alignItems: 'center',
	},
	iconBadge: {
		width: 56,
		height: 56,
		borderRadius: 28,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 16,
	},
	iconText: {
		fontSize: 24,
	},
	title: {
		fontSize: 20,
		fontWeight: '800',
		textAlign: 'center',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 13,
		lineHeight: 19,
		textAlign: 'center',
		marginBottom: 22,
	},
	unlockButton: {
		width: '100%',
		paddingVertical: 14,
		paddingHorizontal: 20,
		borderRadius: 18,
		alignItems: 'center',
	},
	unlockButtonText: {
		color: '#090b09',
		fontSize: 14,
		fontWeight: '800',
	},
});
