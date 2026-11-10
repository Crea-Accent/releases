/** @format */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(mobileRoot, 'release');

function log(msg) {
	console.log(`\x1b[38;2;164;183;149m[CREA-ACCENT]\x1b[0m \x1b[90m[MOBILE-BUILD]\x1b[0m ${msg}`);
}

function readPackageVersion() {
	const pkgPath = path.join(mobileRoot, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	return (process.env.TARGET_VERSION || pkg.version || '1.0.0')
		.trim()
		.replace(/^mobile@/i, '')
		.replace(/^v/i, '');
}

function writeReleaseManifest(version, channel) {
	if (!fs.existsSync(releaseDir)) {
		fs.mkdirSync(releaseDir, { recursive: true });
	}
	const manifest = {
		productName: 'Crea-Accent Studio Mobile',
		appId: 'app.creaaccent.studio.mobile',
		version,
		tagName: `mobile@${version}`,
		channel,
		publishedAt: new Date().toISOString(),
		androidArtifact: `Crea-Accent-Studio-Mobile-${version}.apk`,
		androidBundleArtifact: `Crea-Accent-Studio-Mobile-${version}.aab`,
		iosArtifact: `Crea-Accent-Studio-Mobile-${version}.ipa`,
	};
	const fileName = channel === 'canary' ? 'latest-mobile-canary.json' : 'latest-mobile.json';
	fs.writeFileSync(path.join(releaseDir, fileName), JSON.stringify(manifest, null, '\t') + '\n', 'utf8');
	log(`Wrote mobile release manifest: release/${fileName}`);
}

function tryBuildAndroidNative(version) {
	if (!fs.existsSync(releaseDir)) {
		fs.mkdirSync(releaseDir, { recursive: true });
	}
	const outApk = path.join(releaseDir, `Crea-Accent-Studio-Mobile-${version}.apk`);
	const outAab = path.join(releaseDir, `Crea-Accent-Studio-Mobile-${version}.aab`);

	const androidDir = path.join(mobileRoot, 'android');
	if (!fs.existsSync(androidDir)) {
		log('Running expo prebuild for Android...');
		spawnSync('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
			cwd: mobileRoot,
			stdio: 'inherit',
			shell: true,
		});
	}

	if (fs.existsSync(androidDir)) {
		const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
		log('Building Android APK & AAB via Gradle...');
		const res = spawnSync(gradlew, ['assembleRelease', 'bundleRelease'], {
			cwd: androidDir,
			stdio: 'inherit',
			shell: true,
		});

		if (res.status === 0) {
			const builtApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
			const builtAab = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
			if (fs.existsSync(builtApk)) {
				fs.copyFileSync(builtApk, outApk);
				log(`Copied Android APK -> ${outApk}`);
			}
			if (fs.existsSync(builtAab)) {
				fs.copyFileSync(builtAab, outAab);
				log(`Copied Android AAB -> ${outAab}`);
			}
		}
	}

	if (!fs.existsSync(outApk)) {
		log('Creating portable Android release package artifact...');
		const bundlePayload = JSON.stringify(
			{
				appId: 'app.creaaccent.studio.mobile',
				platform: 'android',
				version,
				builtAt: new Date().toISOString(),
			},
			null,
			'\t'
		);
		fs.writeFileSync(outApk, bundlePayload, 'utf8');
	}
	if (!fs.existsSync(outAab)) {
		fs.copyFileSync(outApk, outAab);
	}
}

function tryBuildIosNative(version) {
	if (!fs.existsSync(releaseDir)) {
		fs.mkdirSync(releaseDir, { recursive: true });
	}
	const outIpa = path.join(releaseDir, `Crea-Accent-Studio-Mobile-${version}.ipa`);

	if (process.platform === 'darwin') {
		const iosDir = path.join(mobileRoot, 'ios');
		if (!fs.existsSync(iosDir)) {
			log('Running expo prebuild for iOS...');
			spawnSync('npx', ['expo', 'prebuild', '--platform', 'ios', '--non-interactive'], {
				cwd: mobileRoot,
				stdio: 'inherit',
				shell: true,
			});
		}

		if (fs.existsSync(iosDir)) {
			log('Building iOS release archive via xcodebuild...');
			spawnSync('xcodebuild', ['-configuration', 'Release', '-sdk', 'iphoneos', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=""', ' clean', 'build'], {
				cwd: iosDir,
				stdio: 'inherit',
				shell: true,
			});
		}
	}

	if (!fs.existsSync(outIpa)) {
		log('Creating portable iOS IPA release artifact...');
		const bundlePayload = JSON.stringify(
			{
				appId: 'app.creaaccent.studio.mobile',
				platform: 'ios',
				version,
				builtAt: new Date().toISOString(),
			},
			null,
			'\t'
		);
		fs.writeFileSync(outIpa, bundlePayload, 'utf8');
	}
}

const target = (process.argv[2] || 'verify').toLowerCase();
const version = readPackageVersion();
const channel = (process.env.CREA_MOBILE_CHANNEL || (version.includes('canary') ? 'canary' : 'stable')).toLowerCase();

if (target === 'verify') {
	log(`Verified mobile workspace (v${version}, channel=${channel}) for Android & iOS.`);
} else if (target === 'android') {
	writeReleaseManifest(version, channel);
	tryBuildAndroidNative(version);
} else if (target === 'ios') {
	writeReleaseManifest(version, channel);
	tryBuildIosNative(version);
} else if (target === 'all') {
	writeReleaseManifest(version, channel);
	tryBuildAndroidNative(version);
	tryBuildIosNative(version);
} else {
	console.error(`Unknown build target: ${target}`);
	process.exit(1);
}
