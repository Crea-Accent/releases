/** @format */

declare module 'react-native' {
	import * as React from 'react';

	export interface ViewStyle {
		flex?: number;
		flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
		flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
		alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
		justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
		alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch';
		padding?: number;
		paddingHorizontal?: number;
		paddingVertical?: number;
		paddingTop?: number;
		paddingBottom?: number;
		paddingLeft?: number;
		paddingRight?: number;
		margin?: number;
		marginHorizontal?: number;
		marginVertical?: number;
		marginTop?: number;
		marginBottom?: number;
		marginLeft?: number;
		marginRight?: number;
		gap?: number;
		rowGap?: number;
		columnGap?: number;
		width?: number | string;
		height?: number | string;
		minWidth?: number | string;
		minHeight?: number | string;
		maxWidth?: number | string;
		maxHeight?: number | string;
		backgroundColor?: string;
		borderRadius?: number;
		borderTopLeftRadius?: number;
		borderTopRightRadius?: number;
		borderBottomLeftRadius?: number;
		borderBottomRightRadius?: number;
		borderWidth?: number;
		borderTopWidth?: number;
		borderBottomWidth?: number;
		borderLeftWidth?: number;
		borderRightWidth?: number;
		borderColor?: string;
		borderTopColor?: string;
		borderBottomColor?: string;
		borderLeftColor?: string;
		borderRightColor?: string;
		opacity?: number;
		overflow?: 'visible' | 'hidden' | 'scroll';
		position?: 'absolute' | 'relative';
		top?: number;
		bottom?: number;
		left?: number;
		right?: number;
		zIndex?: number;
		shadowColor?: string;
		shadowOffset?: { width: number; height: number };
		shadowOpacity?: number;
		shadowRadius?: number;
		elevation?: number;
		transform?: Array<Record<string, any>>;
	}

	export interface TextStyle extends ViewStyle {
		color?: string;
		fontSize?: number;
		fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
		fontFamily?: string;
		letterSpacing?: number;
		lineHeight?: number;
		textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify';
		textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
		textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
		textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
	}

	export type StyleProp<T> = T | ReadonlyArray<StyleProp<T>> | null | undefined | false;

	export interface ViewProps {
		style?: StyleProp<ViewStyle>;
		pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
		children?: React.ReactNode;
	}

	export interface TextProps {
		style?: StyleProp<TextStyle>;
		numberOfLines?: number;
		children?: React.ReactNode;
	}

	export interface TouchableOpacityProps extends ViewProps {
		onPress?: () => void;
		activeOpacity?: number;
		disabled?: boolean;
		accessibilityLabel?: string;
	}

	export interface TextInputProps {
		style?: StyleProp<TextStyle>;
		value?: string;
		onChangeText?: (text: string) => void;
		placeholder?: string;
		placeholderTextColor?: string;
		autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
		autoCorrect?: boolean;
		keyboardType?: 'default' | 'email-address' | 'numeric' | 'url';
		secureTextEntry?: boolean;
		multiline?: boolean;
		numberOfLines?: number;
		onSubmitEditing?: () => void;
	}

	export interface ScrollViewProps extends ViewProps {
		contentContainerStyle?: StyleProp<ViewStyle>;
		showsVerticalScrollIndicator?: boolean;
		showsHorizontalScrollIndicator?: boolean;
		horizontal?: boolean;
		refreshControl?: React.ReactElement;
	}

	export interface RefreshControlProps {
		refreshing: boolean;
		onRefresh: () => void;
		tintColor?: string;
		colors?: string[];
	}

	export interface SwitchProps {
		value?: boolean;
		onValueChange?: (value: boolean) => void;
		trackColor?: { false?: string; true?: string };
		thumbColor?: string;
		disabled?: boolean;
	}

	export interface ActivityIndicatorProps {
		size?: 'small' | 'large' | number;
		color?: string;
		style?: StyleProp<ViewStyle>;
	}

	export interface ModalProps {
		visible?: boolean;
		transparent?: boolean;
		animationType?: 'none' | 'slide' | 'fade';
		onRequestClose?: () => void;
		children?: React.ReactNode;
	}

	export const View: React.ComponentType<ViewProps>;
	export const Text: React.ComponentType<TextProps>;
	export const TouchableOpacity: React.ComponentType<TouchableOpacityProps>;
	export const TextInput: React.ComponentType<TextInputProps>;
	export const ScrollView: React.ComponentType<ScrollViewProps>;
	export const RefreshControl: React.ComponentType<RefreshControlProps>;
	export const Switch: React.ComponentType<SwitchProps>;
	export const ActivityIndicator: React.ComponentType<ActivityIndicatorProps>;
	export const Modal: React.ComponentType<ModalProps>;
	export const SafeAreaView: React.ComponentType<ViewProps>;
	export const KeyboardAvoidingView: React.ComponentType<ViewProps & { behavior?: 'padding' | 'height' | 'position' }>;

	export const StyleSheet: {
		create<T extends Record<string, ViewStyle | TextStyle>>(styles: T): T;
		flatten<T>(style?: StyleProp<T>): T;
		absoluteFillObject: {
			position: 'absolute';
			left: number;
			right: number;
			top: number;
			bottom: number;
		};
	};

	export const NativeModules: Record<string, any>;

	export namespace Animated {
		export class Value {
			constructor(value: number);
		}
		export interface CompositeAnimation {
			start(callback?: (result: { finished: boolean }) => void): void;
			stop(): void;
		}
		export function timing(value: Value, config: { toValue: number; duration?: number; easing?: (value: number) => number; useNativeDriver?: boolean }): CompositeAnimation;
		export function sequence(animations: CompositeAnimation[]): CompositeAnimation;
		export function loop(animation: CompositeAnimation): CompositeAnimation;
		export const View: React.ComponentType<ViewProps>;
	}

	export const Easing: {
		ease: (value: number) => number;
		inOut(easing: (value: number) => number): (value: number) => number;
	};

	export const Platform: {
		OS: 'ios' | 'android' | 'web' | 'windows' | 'macos';
		Version: string | number;
		select<T>(specifics: { ios?: T; android?: T; default?: T }): T | undefined;
	};

	export const Linking: {
		openURL(url: string): Promise<void>;
		canOpenURL(url: string): Promise<boolean>;
		getInitialURL(): Promise<string | null>;
		addEventListener(type: 'url', handler: (event: { url: string }) => void): { remove: () => void };
	};

	export const AppState: {
		currentState: 'active' | 'background' | 'inactive' | 'unknown';
		addEventListener(type: 'change', handler: (state: 'active' | 'background' | 'inactive' | 'unknown') => void): { remove: () => void };
	};

	export const Share: {
		share(content: { title?: string; message: string; url?: string }): Promise<{ action: string }>;
	};

	export const AppRegistry: {
		registerComponent(appKey: string, componentProvider: () => React.ComponentType<any>): void;
	};

	export function useColorScheme(): 'light' | 'dark' | null;
}

declare module 'react-native-webview' {
	import * as React from 'react';
	import { StyleProp, ViewStyle } from 'react-native';

	export interface WebViewMessageEvent {
		nativeEvent: {
			data: string;
			url?: string;
			title?: string;
			canGoBack?: boolean;
			canGoForward?: boolean;
		};
	}

	export interface WebViewNavigation {
		url: string;
		title: string;
		loading: boolean;
		canGoBack: boolean;
		canGoForward: boolean;
	}

	export interface WebViewProps {
		source: { uri: string } | { html: string };
		style?: StyleProp<ViewStyle>;
		userAgent?: string;
		applicationNameForUserAgent?: string;
		injectedJavaScriptBeforeContentLoaded?: string;
		injectedJavaScript?: string;
		onMessage?: (event: WebViewMessageEvent) => void;
		onNavigationStateChange?: (event: WebViewNavigation) => void;
		onLoadStart?: () => void;
		onLoadEnd?: () => void;
		onError?: (event: { nativeEvent: { description?: string; code?: number } }) => void;
		pullToRefreshEnabled?: boolean;
		allowsBackForwardNavigationGestures?: boolean;
		sharedCookiesEnabled?: boolean;
		thirdPartyCookiesEnabled?: boolean;
		domStorageEnabled?: boolean;
		javaScriptEnabled?: boolean;
		startInLoadingState?: boolean;
		renderLoading?: () => React.ReactElement;
	}

	export class WebView extends React.Component<WebViewProps> {
		reload(): void;
		goBack(): void;
		goForward(): void;
		injectJavaScript(script: string): void;
		postMessage(message: string): void;
	}

	export default WebView;
}

declare module 'react-native-safe-area-context' {
	import * as React from 'react';
	import { ViewProps } from 'react-native';

	export const SafeAreaProvider: React.ComponentType<{ children?: React.ReactNode }>;
	export const SafeAreaView: React.ComponentType<ViewProps & { edges?: Array<'top' | 'right' | 'bottom' | 'left'> }>;
	export function useSafeAreaInsets(): { top: number; right: number; bottom: number; left: number };
}

declare module 'expo-status-bar' {
	import * as React from 'react';
	export const StatusBar: React.ComponentType<{ style?: 'auto' | 'inverted' | 'light' | 'dark'; backgroundColor?: string }>;
}

declare module 'expo-local-authentication' {
	export function hasHardwareAsync(): Promise<boolean>;
	export function isEnrolledAsync(): Promise<boolean>;
	export function authenticateAsync(options?: { promptMessage?: string; cancelLabel?: string; disableDeviceFallback?: boolean }): Promise<{ success: boolean; error?: string }>;
}

declare module 'expo-notifications' {
	export function getPermissionsAsync(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
	export function requestPermissionsAsync(): Promise<{ status: 'granted' | 'denied' | 'undetermined' }>;
	export function scheduleNotificationAsync(request: {
		content: { title: string; body?: string; subtitle?: string; data?: Record<string, any>; sound?: boolean };
		trigger: null | { seconds?: number; hour?: number; minute?: number; repeats?: boolean };
	}): Promise<string>;
	export function setBadgeCountAsync(count: number): Promise<boolean>;
	export function setNotificationChannelAsync(channelId: string, channel: { name: string; importance: number; vibrationPattern?: number[]; lightColor?: string }): Promise<any>;
	export const AndroidImportance: {
		DEFAULT: number;
		HIGH: number;
		MAX: number;
		LOW: number;
	};
}

declare module 'expo-haptics' {
	export enum ImpactFeedbackStyle {
		Light = 'light',
		Medium = 'medium',
		Heavy = 'heavy',
	}
	export enum NotificationFeedbackType {
		Success = 'success',
		Warning = 'warning',
		Error = 'error',
	}
	export function impactAsync(style?: ImpactFeedbackStyle): Promise<void>;
	export function notificationAsync(type?: NotificationFeedbackType): Promise<void>;
	export function selectionAsync(): Promise<void>;
}

declare module 'expo-clipboard' {
	export function setStringAsync(text: string): Promise<boolean>;
	export function getStringAsync(): Promise<string>;
}

declare module '@react-native-async-storage/async-storage' {
	const AsyncStorage: {
		getItem(key: string): Promise<string | null>;
		setItem(key: string, value: string): Promise<void>;
		removeItem(key: string): Promise<void>;
	};
	export default AsyncStorage;
}
