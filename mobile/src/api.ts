/** @format */

import { getCachedMobileMetadata, resolveMobileApiBaseUrl } from './metadata';

export interface StudioUser {
	id: string;
	userId: string;
	name: string;
	email: string;
	icon?: string;
	roleId?: string;
	roles?: string[];
	permissions?: string[];
}

export interface LinkedTargetItem {
	linkId: string;
	dossierId: string;
	dossierCode: string;
	dossierName: string;
	projectId?: string;
	projectName?: string;
	scope?: 'dossier' | 'project';
}

export interface WerkbonPayload {
	isWerkbon?: boolean;
	code?: string;
	status?: string;
	workedHours?: number;
	materials?: string;
	notes?: string;
	customerSignature?: string;
}

export interface StudioCalendarEvent {
	id: string;
	graphEventId?: string;
	subject: string;
	bodyPreview?: string;
	bodyText?: string;
	location?: string;
	startAt: string;
	endAt: string;
	isAllDay?: boolean;
	hasSpecificTime?: boolean;
	deadlineAt?: string | null;
	isCompleted?: boolean;
	completionFeedback?: string;
	isQueued?: boolean;
	estimatedDurationMinutes?: number;
	eventType?: 'afspraak' | 'werkbon' | 'call' | 'taak' | 'algemeen' | string;
	importance?: 'low' | 'normal' | 'high';
	isOnlineMeeting?: boolean;
	onlineMeetingUrl?: string;
	ownerId?: string;
	ownerName?: string;
	ownerEmail?: string;
	categories?: string[];
	linkedTargets?: LinkedTargetItem[];
	werkbon?: WerkbonPayload | null;
	responseStatus?: string;
}

export interface StudioProjectSummary {
	id: string;
	dossierId: string;
	dossierCode: string;
	projectCode?: string;
	name: string;
	subdossierLabel?: string;
	discipline?: string;
	status?: string;
	description?: string;
	duotecnoVersion?: string;
	hasTrikker?: boolean;
	hasCanbus?: boolean;
	hasFloorplan?: boolean;
	fileEventCount?: number;
	timelineEventCount?: number;
	lastActivityAt?: string;
}

export interface StudioDossierSummary {
	id: string;
	dossierCode: string;
	name: string;
	clientName?: string;
	address?: string;
	contractor?: string;
	architect?: string;
	status?: string;
	tags?: string[];
	contactEmails?: string[];
	projects?: StudioProjectSummary[];
	offertes?: Array<{
		id: string;
		code?: string;
		title: string;
		amount?: number;
		status?: string;
		fileName?: string;
		updatedAt?: string;
	}>;
	werkbonnen?: Array<{
		id: string;
		code?: string;
		title: string;
		status?: string;
		date?: string;
		technician?: string;
	}>;
	lastActivityAt?: string;
}

export interface StudioTimelineEvent {
	id: string;
	dossierId: string;
	dossierCode?: string;
	projectId?: string;
	projectName?: string;
	scope?: 'dossier' | 'project' | 'multi';
	category: 'mail' | 'schema' | 'duotecno' | 'offerte' | 'ticket' | 'file' | 'change' | 'note' | 'werkbon' | 'agenda' | string;
	title: string;
	description?: string;
	actorName?: string;
	actorEmail?: string;
	actorRole?: string;
	newStatus?: string;
	occurredAt: string;
	metadata?: Record<string, any>;
}

export interface StudioDossierDetail {
	dossier: StudioDossierSummary;
	projects: StudioProjectSummary[];
	masterTimeline: StudioTimelineEvent[];
	projectTimelines: Record<string, StudioTimelineEvent[]>;
	mailThreads: Array<{
		id: string;
		subject: string;
		snippet?: string;
		lastMessageAt?: string;
		messageCount?: number;
		messages?: Array<{
			id: string;
			subject: string;
			from?: { name?: string; email?: string };
			to?: Array<{ name?: string; email?: string }>;
			bodyPreview?: string;
			bodyText?: string;
			sentAt: string;
			direction?: 'inbound' | 'outbound';
		}>;
	}>;
}

export interface StudioMailMessage {
	graphMessageId: string;
	internetMessageId?: string;
	conversationId: string;
	subject: string;
	from: { name: string; email: string };
	to: Array<{ name: string; email: string }>;
	cc?: Array<{ name: string; email: string }>;
	bodyPreview: string;
	bodyText?: string;
	bodyHtml?: string;
	hasAttachments?: boolean;
	attachments?: Array<{ id?: string; name: string; size?: number; contentType?: string }>;
	sentAt: string;
	isRead: boolean;
	folder?: string;
	categories?: string[];
	threadMessages?: StudioMailMessage[];
	linkedThread?: {
		threadId: string;
		dossierId: string;
		projectId?: string;
		projectName?: string;
		dossierCode?: string;
		links?: LinkedTargetItem[];
	} | null;
	suggestions?: Array<{
		dossierId: string;
		dossierCode: string;
		dossierName: string;
		projectId?: string;
		projectName?: string;
		reason?: string;
	}>;
}

const CLOUD_FALLBACK_BASE = 'https://account.crea-accent.app';

async function fetchStudioJson<T>(path: string, init?: RequestInit, domainOverride?: string): Promise<T> {
	const meta = getCachedMobileMetadata();
	const primaryBase = resolveMobileApiBaseUrl(domainOverride || meta.domain);
	const cleanPath = path.startsWith('/') ? path : `/${path}`;
	const primaryUrl = `${primaryBase}${cleanPath}`;

	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json',
		...((init?.headers as Record<string, string>) || {}),
	};

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 9000);
		const res = await fetch(primaryUrl, {
			...init,
			headers,
			signal: controller.signal,
		});
		clearTimeout(timeout);
		if (res.ok) {
			return (await res.json()) as T;
		}
		// If primary was a local LAN IP and returned 502/503/504 or failed, fallback to cloud
		if (primaryBase !== CLOUD_FALLBACK_BASE && res.status >= 500) {
			const cloudRes = await fetch(`${CLOUD_FALLBACK_BASE}${cleanPath}`, { ...init, headers });
			if (cloudRes.ok) return (await cloudRes.json()) as T;
		}
		const errBody = await res.json().catch(() => ({}));
		throw new Error(errBody?.error || `HTTP ${res.status}`);
	} catch (err: any) {
		if (primaryBase !== CLOUD_FALLBACK_BASE) {
			const cloudRes = await fetch(`${CLOUD_FALLBACK_BASE}${cleanPath}`, { ...init, headers });
			if (cloudRes.ok) {
				return (await cloudRes.json()) as T;
			}
			const errBody = await cloudRes.json().catch(() => ({}));
			throw new Error(errBody?.error || `HTTP ${cloudRes.status}`);
		}
		throw err;
	}
}

export async function loginWithEmailPassword(email: string, password: string, domain?: string): Promise<StudioUser> {
	const res = await fetchStudioJson<{ data?: StudioUser; error?: string }>(
		'/secure/auth/verify',
		{
			method: 'POST',
			body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
		},
		domain
	);
	if (!res?.data) {
		throw new Error(res?.error || 'Ongeldige inloggegevens');
	}
	return res.data;
}

export async function fetchCalendarWorkspace(params?: { userId?: string; dossierId?: string; search?: string; domain?: string }): Promise<{
	events: StudioCalendarEvent[];
	dossiers: StudioDossierSummary[];
}> {
	const qs = new URLSearchParams();
	if (params?.userId) qs.set('userId', params.userId);
	if (params?.dossierId) qs.set('dossierId', params.dossierId);
	if (params?.search) qs.set('search', params.search);
	const query = qs.toString() ? `?${qs.toString()}` : '';
	const data = await fetchStudioJson<{ events?: StudioCalendarEvent[]; dossiers?: StudioDossierSummary[] }>(`/secure/calendar/events${query}`, undefined, params?.domain);
	return {
		events: Array.isArray(data?.events) ? data.events : [],
		dossiers: Array.isArray(data?.dossiers) ? data.dossiers : [],
	};
}

export async function createCalendarItem(
	payload: {
		userId?: string;
		subject: string;
		eventType: 'afspraak' | 'werkbon' | 'call' | 'taak' | 'algemeen';
		location?: string;
		bodyText?: string;
		startAt: string;
		endAt: string;
		isAllDay?: boolean;
		hasSpecificTime?: boolean;
		isQueued?: boolean;
		importance?: 'low' | 'normal' | 'high';
		dossierId?: string;
		projectId?: string;
		isWerkbon?: boolean;
		werkbon?: Partial<WerkbonPayload>;
	},
	domain?: string
): Promise<StudioCalendarEvent> {
	const res = await fetchStudioJson<{ event: StudioCalendarEvent }>(
		'/secure/calendar/events',
		{
			method: 'POST',
			body: JSON.stringify(payload),
		},
		domain
	);
	return res.event;
}

export async function updateCalendarItem(
	payload: {
		eventId: string;
		graphEventId?: string;
		userId?: string;
		action?: 'update' | 'addLink' | 'removeLink' | 'rsvp';
		subject?: string;
		location?: string;
		bodyText?: string;
		startAt?: string;
		endAt?: string;
		isCompleted?: boolean;
		completionFeedback?: string;
		eventType?: string;
		importance?: 'low' | 'normal' | 'high';
		dossierId?: string;
		projectId?: string;
		linkId?: string;
		response?: 'accept' | 'tentativelyAccept' | 'decline';
		werkbon?: Partial<WerkbonPayload>;
		eventSnapshot?: Partial<StudioCalendarEvent>;
	},
	domain?: string
): Promise<StudioCalendarEvent> {
	const res = await fetchStudioJson<{ event: StudioCalendarEvent }>(
		'/secure/calendar/events',
		{
			method: 'PATCH',
			body: JSON.stringify(payload),
		},
		domain
	);
	return res.event;
}

export async function deleteCalendarItem(eventId: string, graphEventId?: string, userId?: string, domain?: string): Promise<boolean> {
	const qs = new URLSearchParams({ eventId });
	if (graphEventId) qs.set('graphEventId', graphEventId);
	if (userId) qs.set('userId', userId);
	await fetchStudioJson(`/secure/calendar/events?${qs.toString()}`, { method: 'DELETE' }, domain);
	return true;
}

export async function fetchAllDossiers(domain?: string): Promise<StudioDossierSummary[]> {
	const res = await fetchStudioJson<{ dossiers?: StudioDossierSummary[]; data?: StudioDossierSummary[] }>('/secure/dossiers', undefined, domain);
	return Array.isArray(res?.dossiers) ? res.dossiers : Array.isArray(res?.data) ? res.data : [];
}

export async function fetchDossierDetail(dossierId: string, userId?: string, domain?: string): Promise<StudioDossierDetail> {
	const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
	const res = await fetchStudioJson<any>(`/secure/dossiers/${encodeURIComponent(dossierId)}${qs}`, undefined, domain);
	const payload = res?.data || res;
	return {
		dossier: payload?.dossier || payload,
		projects: Array.isArray(payload?.projects) ? payload.projects : Array.isArray(payload?.dossier?.projects) ? payload.dossier.projects : [],
		masterTimeline: Array.isArray(payload?.masterTimeline) ? payload.masterTimeline : [],
		projectTimelines: payload?.projectTimelines || {},
		mailThreads: Array.isArray(payload?.mailThreads) ? payload.mailThreads : [],
	};
}

export async function createDossierOrSubproject(
	payload: {
		mode: 'dossier' | 'project';
		dossierId?: string;
		dossierCode?: string;
		name: string;
		clientName?: string;
		address?: string;
		contractor?: string;
		architect?: string;
		discipline?: string;
		subdossierLabel?: string;
		description?: string;
		actorName?: string;
		actorEmail?: string;
	},
	domain?: string
): Promise<any> {
	return fetchStudioJson(
		'/secure/dossiers',
		{
			method: 'POST',
			body: JSON.stringify(payload),
		},
		domain
	);
}

export async function logDossierTimelineUpdate(
	dossierId: string,
	payload: {
		projectId?: string;
		category: 'change' | 'note' | 'werkbon' | 'schema' | 'duotecno' | 'offerte' | 'agenda';
		title: string;
		description?: string;
		newStatus?: string;
		actorName?: string;
		actorEmail?: string;
		metadata?: Record<string, any>;
	},
	domain?: string
): Promise<StudioTimelineEvent> {
	const res = await fetchStudioJson<{ event: StudioTimelineEvent }>(
		`/secure/dossiers/${encodeURIComponent(dossierId)}`,
		{
			method: 'POST',
			body: JSON.stringify({
				dossierId,
				...payload,
			}),
		},
		domain
	);
	return res.event;
}

export async function fetchMailboxMessages(params?: { userId?: string; folder?: 'inbox' | 'sentitems' | 'archive' | 'deleteditems'; search?: string; top?: number; domain?: string }): Promise<{
	messages: StudioMailMessage[];
	connectedEmail?: string;
	dossiers: StudioDossierSummary[];
}> {
	const qs = new URLSearchParams();
	if (params?.userId) qs.set('userId', params.userId);
	qs.set('folder', params?.folder || 'inbox');
	if (params?.search) qs.set('search', params.search);
	qs.set('top', String(params?.top || 30));

	const res = await fetchStudioJson<{
		messages?: StudioMailMessage[];
		connectedEmail?: string;
		dossiers?: StudioDossierSummary[];
	}>(`/secure/mail/messages?${qs.toString()}`, undefined, params?.domain);

	return {
		messages: Array.isArray(res?.messages) ? res.messages : [],
		connectedEmail: res?.connectedEmail,
		dossiers: Array.isArray(res?.dossiers) ? res.dossiers : [],
	};
}

export async function performMailMessageAction(
	payload: {
		userId?: string;
		messageId: string;
		messageIds?: string[];
		action: 'markread' | 'markunread' | 'flag' | 'unflag' | 'archive' | 'delete';
		permanent?: boolean;
	},
	domain?: string
): Promise<any> {
	return fetchStudioJson(
		'/secure/mail/messages',
		{
			method: 'POST',
			body: JSON.stringify(payload),
		},
		domain
	);
}

export async function linkMailThreadToDossier(
	payload: {
		userId?: string;
		dossierId: string;
		projectId?: string;
		projectName?: string;
		conversationId?: string;
		graphMessageId?: string;
		messageSnapshot?: Partial<StudioMailMessage>;
	},
	domain?: string
): Promise<any> {
	return fetchStudioJson(
		'/secure/mail/link',
		{
			method: 'POST',
			body: JSON.stringify(payload),
		},
		domain
	);
}

export async function sendStudioEmail(
	payload: {
		userId?: string;
		to: string;
		cc?: string;
		subject: string;
		bodyText: string;
		importance?: 'low' | 'normal' | 'high';
		replyToGraphMessageId?: string;
		inReplyToInternetMessageId?: string;
		conversationId?: string;
		dossierId?: string;
		projectId?: string;
		projectName?: string;
	},
	domain?: string
): Promise<any> {
	return fetchStudioJson(
		'/secure/mail/send',
		{
			method: 'POST',
			body: JSON.stringify(payload),
		},
		domain
	);
}
