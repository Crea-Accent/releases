/** @format */

import { BrowserWindow, dialog, shell } from 'electron';
import Store from 'electron-store';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface SyncedProjectInfo {
	localPath: string;
	syncedAt: string;
	projectName?: string;
}

export function getLocalSyncedProjects(store: Store): Record<string, SyncedProjectInfo> {
	const raw = store.get('localSyncedProjects') as Record<string, SyncedProjectInfo> | undefined;
	if (!raw || typeof raw !== 'object') return {};
	const verified: Record<string, SyncedProjectInfo> = {};
	for (const [id, info] of Object.entries(raw)) {
		if (info?.localPath && fs.existsSync(info.localPath)) {
			verified[id] = info;
		}
	}
	return verified;
}

export async function selectProjectsFolder(win: BrowserWindow | undefined, currentDir: string): Promise<{ localProjectsDir: string } | null> {
	try {
		const res =
			win && !win.isDestroyed()
				? await dialog.showOpenDialog(win, { defaultPath: currentDir, properties: ['openDirectory', 'createDirectory'] })
				: await dialog.showOpenDialog({ defaultPath: currentDir, properties: ['openDirectory', 'createDirectory'] });
		if (res.canceled || !res.filePaths?.[0]) return null;
		const chosen = res.filePaths[0];
		if (!fs.existsSync(chosen)) {
			fs.mkdirSync(chosen, { recursive: true });
		}
		return { localProjectsDir: chosen };
	} catch {
		return null;
	}
}

export async function selectDuotecnoFolder(win: BrowserWindow | undefined, currentDir: string): Promise<{ duotecnoDir: string } | null> {
	try {
		const res =
			win && !win.isDestroyed()
				? await dialog.showOpenDialog(win, { defaultPath: currentDir, properties: ['openDirectory', 'createDirectory'] })
				: await dialog.showOpenDialog({ defaultPath: currentDir, properties: ['openDirectory', 'createDirectory'] });
		if (res.canceled || !res.filePaths?.[0]) return null;
		return { duotecnoDir: res.filePaths[0] };
	} catch {
		return null;
	}
}

export async function openProjectFolder(targetDir?: string): Promise<{ ok: boolean; error?: string }> {
	const resolved = (targetDir || 'C:\\Crea-Accent\\Projects').trim();
	try {
		const isUnc = resolved.startsWith('\\\\');
		let pathToOpen = resolved;
		if (!fs.existsSync(pathToOpen)) {
			if (isUnc) {
				const parentDir = path.win32.dirname(pathToOpen);
				if (fs.existsSync(parentDir)) {
					pathToOpen = parentDir;
				} else {
					return { ok: false, error: 'NAS folder is not reachable on this network' };
				}
			} else {
				fs.mkdirSync(pathToOpen, { recursive: true });
			}
		}
		const err = await shell.openPath(pathToOpen);
		return err ? { ok: false, error: err } : { ok: true };
	} catch (err: any) {
		return { ok: false, error: err?.message || 'Failed to open directory' };
	}
}

export async function syncProjectToLocal(
	store: Store,
	payload: {
		projectId: string;
		projectName: string;
		localProjectsDir?: string;
		files?: Array<{ relativePath: string; encoding?: string; content: string }>;
		metadata?: Record<string, any>;
	},
	log: (msg: string) => void
): Promise<{ ok: boolean; localPath: string; fileCount: number; error?: string }> {
	const baseRoot = (payload?.localProjectsDir || 'C:\\Crea-Accent\\Projects').trim();
	const safeFolderName = String(payload?.projectName || payload?.projectId || 'Project')
		.trim()
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
	const projectDir = path.join(baseRoot, safeFolderName);

	try {
		for (const sub of ['Programmation', 'Schema', 'Documents', 'Picture']) {
			fs.mkdirSync(path.join(projectDir, sub), { recursive: true });
		}

		if (payload?.metadata) {
			const metaFile = path.join(projectDir, 'metadata.json');
			fs.writeFileSync(metaFile, JSON.stringify(payload.metadata, null, 2), 'utf8');
		}

		let writtenCount = 0;
		for (const file of payload?.files || []) {
			if (!file?.relativePath) continue;
			const cleanRel = file.relativePath.replace(/^[/\\]+/, '').replace(/\.\./g, '');
			const destPath = path.join(projectDir, cleanRel);
			const destDir = path.dirname(destPath);
			if (!fs.existsSync(destDir)) {
				fs.mkdirSync(destDir, { recursive: true });
			}
			const buf = file.encoding === 'base64' ? Buffer.from(file.content || '', 'base64') : Buffer.from(file.content || '', 'utf8');
			fs.writeFileSync(destPath, buf);
			writtenCount++;
		}

		const map = getLocalSyncedProjects(store);
		map[payload.projectId] = {
			localPath: projectDir,
			syncedAt: new Date().toISOString(),
			projectName: payload.projectName,
		};
		store.set('localSyncedProjects', map);
		log(`CREA-SYNC: Synced project "${payload.projectName}" (${writtenCount} files) -> ${projectDir}`);

		return { ok: true, localPath: projectDir, fileCount: writtenCount };
	} catch (err: any) {
		log(`ERROR: Failed to sync project "${payload?.projectName}": ${err?.message}`);
		return { ok: false, localPath: projectDir, fileCount: 0, error: err?.message || 'Failed to write project files' };
	}
}

function findDuotecnoExecutable(duotecnoDir: string, versionHint?: string | null): string | null {
	try {
		if (!fs.existsSync(duotecnoDir)) return null;
		const entries = fs.readdirSync(duotecnoDir, { withFileTypes: true }).filter((e) => e.isDirectory());
		const normHint = (versionHint || '').replace(/[^0-9.]/g, '');

		const candidates = entries.map((e) => e.name);
		if (normHint) {
			candidates.sort((a, b) => {
				const aHas = a.includes(normHint) ? 1 : 0;
				const bHas = b.includes(normHint) ? 1 : 0;
				return bHas - aHas || b.localeCompare(a);
			});
		} else {
			candidates.sort((a, b) => b.localeCompare(a));
		}

		for (const folder of candidates) {
			const folderAbs = path.join(duotecnoDir, folder);
			const files = fs.readdirSync(folderAbs);
			const exe = files.find((f) => f.toLowerCase().endsWith('.exe'));
			if (exe) {
				return path.join(folderAbs, exe);
			}
		}
	} catch {}
	return null;
}

export async function openProjectInDuotecno(
	payload: {
		projectId: string;
		projectName: string;
		localProjectsDir?: string;
		duotecnoDir?: string;
		duotecnoVersion?: string | null;
	},
	log: (msg: string) => void
): Promise<{ ok: boolean; launchedExe?: string; openedFolder?: string; error?: string }> {
	const baseRoot = (payload?.localProjectsDir || 'C:\\Crea-Accent\\Projects').trim();
	const safeFolderName = String(payload?.projectName || payload?.projectId || 'Project')
		.trim()
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
	const projectDir = path.join(baseRoot, safeFolderName);
	const progDir = path.join(projectDir, 'Programmation');

	if (!fs.existsSync(projectDir)) {
		fs.mkdirSync(progDir, { recursive: true });
	}

	const exePath = findDuotecnoExecutable((payload?.duotecnoDir || 'C:\\Duotecno').trim(), payload?.duotecnoVersion);
	if (exePath && fs.existsSync(exePath)) {
		try {
			const child = spawn(exePath, [progDir], {
				cwd: path.dirname(exePath),
				detached: true,
				windowsHide: false,
				stdio: 'ignore',
			});
			child.unref();
			log(`DUOTECNO LAUNCHED: ${exePath} -> ${progDir}`);
			return { ok: true, launchedExe: exePath, openedFolder: progDir };
		} catch (err: any) {
			return { ok: false, error: err?.message || 'Failed to launch Duotecno executable' };
		}
	}

	const targetToOpen = fs.existsSync(progDir) ? progDir : projectDir;
	await shell.openPath(targetToOpen);
	log(`DUOTECNO FOLDER OPENED: ${targetToOpen}`);
	return { ok: true, openedFolder: targetToOpen };
}

export async function openProjectInTrikker(
	payload: {
		projectId: string;
		projectName: string;
		localProjectsDir?: string;
	},
	log: (msg: string) => void
): Promise<{ ok: boolean; filePath?: string; error?: string }> {
	const baseRoot = (payload?.localProjectsDir || 'C:\\Crea-Accent\\Projects').trim();
	const safeFolderName = String(payload?.projectName || payload?.projectId || 'Project')
		.trim()
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
	const projectDir = path.join(baseRoot, safeFolderName);
	const schemaDir = path.join(projectDir, 'Schema');

	const searchDirs = [schemaDir, projectDir].filter((d) => fs.existsSync(d));
	const trikFiles: Array<{ fullPath: string; mtimeMs: number; name: string }> = [];

	for (const dir of searchDirs) {
		for (const file of fs.readdirSync(dir)) {
			if (file.toLowerCase().endsWith('.trik')) {
				const fullPath = path.join(dir, file);
				const st = fs.statSync(fullPath);
				trikFiles.push({ fullPath, mtimeMs: st.mtimeMs, name: file });
			}
		}
	}

	if (trikFiles.length === 0) {
		await shell.openPath(fs.existsSync(schemaDir) ? schemaDir : projectDir);
		return { ok: true, filePath: schemaDir };
	}

	trikFiles.sort((a, b) => b.name.localeCompare(a.name) || b.mtimeMs - a.mtimeMs);
	const chosen = trikFiles[0].fullPath;
	const err = await shell.openPath(chosen);
	log(`TRIKKER LAUNCHED: ${chosen}`);
	return err ? { ok: false, error: err } : { ok: true, filePath: chosen };
}
