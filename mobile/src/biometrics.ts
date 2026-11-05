/** @format */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricSupportInfo {
	supported: boolean;
	enrolled: boolean;
	label: string;
}

export async function getBiometricSupportInfo(): Promise<BiometricSupportInfo> {
	try {
		const [hasHardware, isEnrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
		return {
			supported: Boolean(hasHardware),
			enrolled: Boolean(isEnrolled),
			label: Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'Biometric Fingerprint / Face Unlock',
		};
	} catch {
		return {
			supported: false,
			enrolled: false,
			label: Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'Biometrics',
		};
	}
}

export async function verifyMobileBiometrics(reason?: string): Promise<boolean> {
	try {
		const info = await getBiometricSupportInfo();
		if (!info.supported || !info.enrolled) {
			return true;
		}
		const result = await LocalAuthentication.authenticateAsync({
			promptMessage: reason || 'Unlock Crea-Accent Studio',
			cancelLabel: 'Cancel',
			disableDeviceFallback: false,
		});
		return Boolean(result.success);
	} catch {
		return false;
	}
}
