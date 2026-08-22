import { 
  readFileSync, 
  writeFileSync, 
  copyFileSync, 
  existsSync, 
  unlinkSync, 
  mkdirSync,
  renameSync,
  statSync
} from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const CONFIG = {
  EXEC_TIMEOUT: 60_000,
  VERSION_FILES: {
    STABLE: 'versions.json',
    BETA: 'version-beta.json'
  },
  REQUIRED_FILES: ['manifest.json', 'package.json'],
  BUILD_OUTPUT: 'main.js',
  ASSETS: {
    MANIFEST: 'manifest.json',
    STYLES: 'styles.css'
  }
};

function run(command, options = {}) {
  const fullCommand = `set -euo pipefail; ${command}`;
  console.log(`> ${command}`);
  
  try {
    execSync(fullCommand, {
      encoding: 'utf-8',
      stdio: 'inherit',
      timeout: CONFIG.EXEC_TIMEOUT,
      shell: '/bin/bash',
      ...options
    });
  } catch (error) {
    const msg = `Command failed (exit ${error.status || 'unknown'}): ${command}`;
    throw new Error(msg, { cause: error });
  }
}

function runSilently(command) {
  try {
    execSync(command, { stdio: 'pipe', timeout: CONFIG.EXEC_TIMEOUT });
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON "${filePath}": ${error.message}`, { cause: error });
  }
}

function writeJsonFile(filePath, data) {
  const tempDir = join(tmpdir(), 'version-manager');
  mkdirSync(tempDir, { recursive: true });
  const tempPath = join(tempDir, `${Date.now()}-${Math.random()}-${basename(filePath)}.tmp`);
  
  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    renameSync(tempPath, filePath);
    console.log(`✅ Updated ${filePath}`);
  } catch (error) {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw new Error(`Failed to write "${filePath}": ${error.message}`, { cause: error });
  }
}

function isBetaVersion(version) {
  if (!semver.valid(version)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }
  return /^.+-beta\.\d+$/.test(version);
}

function getLatestVersionEntry(versions) {
  const keys = Object.keys(versions);
  if (keys.length === 0) return null;
  
  const latest = keys.reduce((max, v) => semver.gt(v, max) ? v : max, keys[0]);
  return { version: latest, minAppVersion: versions[latest] };
}

function shouldTriggerRelease(latest, newVersion, newMinApp) {
  if (!latest) {
    console.log('ℹ️ First release detected');
    return true;
  }
  
  const versionCmp = semver.compare(newVersion, latest.version);
  if (versionCmp > 0) {
    console.log(`📈 Version ${newVersion} > ${latest.version}`);
    return true;
  }
  
  if (versionCmp === 0 && semver.gt(newMinApp, latest.minAppVersion)) {
    console.log(`📈 Same version ${newVersion} but minAppVersion increased from ${latest.minAppVersion} to ${newMinApp}`);
    return true;
  }
  
  return false;
}

async function retry(fn, attempts = 3, delayMs = 1500) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        console.warn(`⚠️  Attempt ${i + 1}/${attempts} failed: ${error.message}`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

function validateBuildOutput(expectedPath = CONFIG.BUILD_OUTPUT) {
  console.log(`🔍 Validating build output: ${expectedPath}`);
  
  if (!existsSync(expectedPath)) {
    throw new Error(`Build artifact not found: ${expectedPath}`);
  }
  
  const stats = statSync(expectedPath);
  if (stats.size === 0) {
    throw new Error(`Build artifact is empty: ${expectedPath}`);
  }
  
  console.log(`✅ Build valid (${stats.size} bytes)`);
}

function prepareReleaseAsset(sourcePath, destPath) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Asset source not found: ${sourcePath}`);
  }
  
  if (sourcePath !== destPath) {
    copyFileSync(sourcePath, destPath);
    console.log(`📋 Prepared asset: ${destPath}`);
  }
}

async function main() {
  const start = Date.now();
  const branch = process.env.GITHUB_REF_NAME || 'local';
  console.log(`\n🚀 Version Manager v2026.1.0 | Branch: ${branch}`);
  
  const backups = new Map();
  const filesToBackup = [
    ...CONFIG.REQUIRED_FILES,
    CONFIG.VERSION_FILES.STABLE,
    CONFIG.VERSION_FILES.BETA
  ];
  
  for (const file of filesToBackup) {
    if (existsSync(file)) {
      backups.set(file, readFileSync(file, 'utf-8'));
    }
  }
  
  const manifest = readJsonFile(CONFIG.ASSETS.MANIFEST);
  const { version: manifestVersion, minAppVersion, id: pluginId, name: pluginName } = manifest;
  
  if (!semver.valid(manifestVersion)) {
    throw new Error(`manifest.json contains invalid version: "${manifestVersion}"`);
  }
  if (!semver.valid(minAppVersion)) {
    throw new Error(`manifest.json contains invalid minAppVersion: "${minAppVersion}"`);
  }
  
  console.log(`📦 ${pluginName} (${pluginId}) v${manifestVersion} (min: ${minAppVersion})`);
  
  const isBeta = isBetaVersion(manifestVersion);
  const versionFile = isBeta ? CONFIG.VERSION_FILES.BETA : CONFIG.VERSION_FILES.STABLE;
  console.log(`🎯 ${isBeta ? '🔬 Beta' : '📦 Stable'} release | Version file: ${versionFile}`);
  
  const versions = existsSync(versionFile) ? readJsonFile(versionFile) : {};
  const packageJson = readJsonFile('package.json');
  
  if (versions[manifestVersion]) {
    throw new Error(`Version ${manifestVersion} already exists in ${versionFile}`);
  }
  
  if (isBeta && existsSync(CONFIG.VERSION_FILES.STABLE)) {
    const stableVersions = readJsonFile(CONFIG.VERSION_FILES.STABLE);
    if (stableVersions[manifestVersion]) {
      throw new Error(`Beta version ${manifestVersion} conflicts with stable release`);
    }
  }
  
  const latest = getLatestVersionEntry(versions);
  if (!shouldTriggerRelease(latest, manifestVersion, minAppVersion)) {
    console.log(`ℹ️ No release needed. Latest: v${latest?.version}`);
    process.exit(0);
  }
  
  if (!isBeta && packageJson.version !== manifestVersion) {
    console.log('🔄 Syncing package.json version');
    packageJson.version = manifestVersion;
    writeJsonFile('package.json', packageJson);
  }
  
  try {
    console.log('🏗️ Building project...');
    run('pnpm run build');
    validateBuildOutput();
    
    const releaseAssets = [CONFIG.ASSETS.MANIFEST];
    
    const mainJsPath = 'main.js';
    prepareReleaseAsset(CONFIG.BUILD_OUTPUT, mainJsPath);
    releaseAssets.push(mainJsPath);
    
    const stylesPath = CONFIG.ASSETS.STYLES;
    if (existsSync(stylesPath)) {
      const content = readFileSync(stylesPath, 'utf-8').trim();
      if (content.length > 0) {
        releaseAssets.push(stylesPath);
        console.log(`🎨 Including ${stylesPath}`);
      } else {
        console.log(`⚠️ Skipping empty ${stylesPath}`);
      }
    }
    
    console.log(`🔎 Checking for existing release ${manifestVersion}...`);
    if (runSilently(`gh release view ${manifestVersion}`)) {
      console.log(`♻️ Removing existing release ${manifestVersion}...`);
      await retry(() => run(`gh release delete ${manifestVersion} --yes --cleanup-tag`));
    }
    
    const assets = releaseAssets.join(' ');
    const prereleaseFlag = isBeta ? '--prerelease' : '';
    const title = isBeta ? `${pluginName} Beta ${manifestVersion}` : `${pluginName} ${manifestVersion}`;
    const notes = `Automated release for ${pluginId} v${manifestVersion}`;
    
    console.log(`📦 Creating ${isBeta ? 'pre-release' : 'release'} ${manifestVersion}...`);
    await retry(() =>
      run(`gh release create ${manifestVersion} ${assets} --title "${title}" --notes "${notes}" ${prereleaseFlag}`)
    );
    
    if (versions[manifestVersion] !== minAppVersion) {
      versions[manifestVersion] = minAppVersion;
      writeJsonFile(versionFile, versions);
    }
    
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n🎉 Success! Release completed in ${duration}s`);
    
  } catch (error) {
    console.error(`\n❌ Fatal Error: ${error.message}`);
    
    console.log('\n🔄 Rolling back changes...');
    for (const [file, content] of backups) {
      writeFileSync(file, content, 'utf-8');
      console.log(`↩️ Restored ${file}`);
    }
    
    if (existsSync('main.js')) {
      unlinkSync('main.js');
    }
    
    if (runSilently(`gh release view ${manifestVersion}`)) {
      console.log(`🧹 Cleaning up failed release ${manifestVersion}...`);
      runSilently(`gh release delete ${manifestVersion} --yes --cleanup-tag`);
    }
    
    console.log('✅ Rollback complete');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('\n💥 Unhandled error:', err);
    process.exit(1);
  });
}

export { main };
