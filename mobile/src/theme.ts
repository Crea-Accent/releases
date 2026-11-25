/** @format */

export interface MobileThemePalette {
	mode: 'dark' | 'light';
	background: string;
	foreground: string;
	card: string;
	cardElevated: string;
	recessed: string;
	text: string;
	textMuted: string;
	border: string;
	accent: string;
	accentSoft: string;
	accentBorder: string;
	accentGreen: string;
	accentOrange: string;
	accentRed: string;
}

export const CREA_SAGE_ACCENT = '#a4b795';

export function getMobileTheme(mode: 'dark' | 'light' = 'dark', customAccent?: string): MobileThemePalette {
	const accent = customAccent && /^#[0-9a-f]{6}$/i.test(customAccent.trim()) ? customAccent.trim() : CREA_SAGE_ACCENT;

	if (mode === 'light') {
		return {
			mode: 'light',
			background: '#f6f7f4',
			foreground: '#ffffff',
			card: 'rgba(255, 255, 255, 0.88)',
			cardElevated: '#ffffff',
			recessed: 'rgba(240, 243, 238, 0.85)',
			text: '#141813',
			textMuted: '#636b5f',
			border: 'rgba(20, 24, 19, 0.1)',
			accent,
			accentSoft: 'rgba(164, 183, 149, 0.16)',
			accentBorder: 'rgba(164, 183, 149, 0.38)',
			accentGreen: '#22c55e',
			accentOrange: '#f59e0b',
			accentRed: '#ef4444',
		};
	}

	return {
		mode: 'dark',
		background: '#090b09',
		foreground: '#121612',
		card: 'rgba(22, 27, 22, 0.82)',
		cardElevated: '#1a201a',
		recessed: 'rgba(11, 14, 11, 0.72)',
		text: '#f3f6f1',
		textMuted: '#94a08e',
		border: 'rgba(243, 246, 241, 0.1)',
		accent,
		accentSoft: 'rgba(164, 183, 149, 0.15)',
		accentBorder: 'rgba(164, 183, 149, 0.35)',
		accentGreen: '#4ade80',
		accentOrange: '#fbbf24',
		accentRed: '#f87171',
	};
}
