import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { 
  readFileSync, 
  writeFileSync, 
  copyFileSync, 
  unlinkSync, 
  mkdtempSync,
  rmSync,
  renameSync,
  statSync,
  appendFileSync
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import process from 'node:process';
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

/**
 * Appends output key-values to $GITHUB_OUTPUT if running inside GitHub Actions.
 */
function setGithubOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }

  const strValue = String(value);
  if (strValue.includes('\n')) {
    const delimiter = `DELIMITER_${randomBytes(8).toString('hex')}`;
    appendFileSync(
      outputFile,
      `${key}<<${delimiter}\n${strValue}\n${delimiter}\n`,
      'utf-8'
    );
  } else {
    appendFileSync(outputFile, `${key}=${strValue}\n`, 'utf-8');
  }
}

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
    const status = (error && typeof error === 'object' && 'status' in error && error.status) 
      ? String(error.status) 
      : 'unknown';
    const msg = `Command failed (exit ${status}): ${command}`;
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON "${filePath}": ${errorMessage}`, { cause: error });
  }
}

/**
 * Securely writes JSON content atomically.
 *
 * Creates a dedicated, permission-restricted directory (0700) located within
 * the target file's directory (ensuring same-filesystem atomic rename without EXDEV failures),
 * writes with exclusive creation flags and restrictive permissions (0600), and removes
 * temporary directory scaffolding upon completion.
 */
function writeJsonFile(filePath, data) {
  const resolvedPath = resolve(filePath);
  const targetDir = dirname(resolvedPath);
  const tempDir = mkdtempSync(join(targetDir, '.tmp-vm-'));
  const tempPath = join(tempDir, `${basename(resolvedPath)}.tmp`);
  
  try {
    writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx'
    });
    renameSync(tempPath, resolvedPath);
    console.log(`✅ Updated ${filePath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write "${filePath}": ${errorMessage}`, { cause: error });
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary directory cleanup failure to avoid masking operation errors
    }
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
  if (keys.length === 0) {
    return null;
  }
  
  const firstKey = keys[0];
  if (!firstKey) {
    return null;
  }
  
  const latest = keys.reduce((max, v) => {
    return semver.gt(v, max) ? v : max;
  }, firstKey);

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
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️  Attempt ${String(i + 1)}/${String(attempts)} failed: ${errorMessage}`);
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs);
        });
      }
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`Operation failed after ${String(attempts)} attempts: ${String(lastError)}`);
}

function validateBuildOutput(expectedPath = CONFIG.BUILD_OUTPUT) {
  console.log(`🔍 Validating build output: ${expectedPath}`);
  
  let stats;
  try {
    stats = statSync(expectedPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Build artifact not found: ${expectedPath} (${errorMessage})`, { cause: error });
  }
  
  if (stats.size === 0) {
    throw new Error(`Build artifact is empty: ${expectedPath}`);
  }
  
  console.log(`✅ Build valid (${String(stats.size)} bytes)`);
}

function prepareReleaseAsset(sourcePath, destPath) {
  if (sourcePath === destPath) {
    return;
  }

  try {
    copyFileSync(sourcePath, destPath);
    console.log(`📋 Prepared asset: ${destPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to prepare asset "${sourcePath}" -> "${destPath}": ${errorMessage}`, { cause: error });
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
    try {
      backups.set(file, readFileSync(file, 'utf-8'));
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
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
  
  // Set basic metadata outputs
  setGithubOutput('is_beta', String(isBeta));
  setGithubOutput('version', manifestVersion);
  setGithubOutput('version_file', versionFile);

  let versions = {};
  try {
    versions = readJsonFile(versionFile);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('cause' in error) || !error.cause || typeof error.cause !== 'object' || !('code' in error.cause) || error.cause.code !== 'ENOENT') {
      throw error;
    }
  }

  const packageJson = readJsonFile('package.json');
  
  if (versions[manifestVersion]) {
    throw new Error(`Version ${manifestVersion} already exists in ${versionFile}`);
  }
  
  if (isBeta) {
    try {
      const stableVersions = readJsonFile(CONFIG.VERSION_FILES.STABLE);
      if (stableVersions[manifestVersion]) {
        throw new Error(`Beta version ${manifestVersion} conflicts with stable release`);
      }
    } catch (stableError) {
      if (!stableError || typeof stableError !== 'object' || !('cause' in stableError) || !stableError.cause || typeof stableError.cause !== 'object' || !('code' in stableError.cause) || stableError.cause.code !== 'ENOENT') {
        throw stableError;
      }
    }
  }
  
  const latest = getLatestVersionEntry(versions);
  if (!shouldTriggerRelease(latest, manifestVersion, minAppVersion)) {
    console.log(`ℹ️ No release needed. Latest: v${latest ? latest.version : 'none'}`);
    setGithubOutput('released', 'false');
    setGithubOutput('artifacts', '');
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
    try {
      const content = readFileSync(stylesPath, 'utf-8').trim();
      if (content.length > 0) {
        releaseAssets.push(stylesPath);
        console.log(`🎨 Including ${stylesPath}`);
      } else {
        console.log(`⚠️ Skipping empty ${stylesPath}`);
      }
    } catch (stylesError) {
      if (!stylesError || typeof stylesError !== 'object' || !('code' in stylesError) || stylesError.code !== 'ENOENT') {
        throw stylesError;
      }
    }
    
    console.log(`🔎 Checking for existing release ${manifestVersion}...`);
    if (runSilently(`gh release view ${manifestVersion}`)) {
      console.log(`♻️ Removing existing release ${manifestVersion}...`);
      await retry(async () => {
        run(`gh release delete ${manifestVersion} --yes --cleanup-tag`);
      });
    }
    
    const assets = releaseAssets.join(' ');
    const prereleaseFlag = isBeta ? '--prerelease' : '';
    const title = isBeta ? `${pluginName} Beta ${manifestVersion}` : `${pluginName} ${manifestVersion}`;
    const notes = `Automated release for ${pluginId} v${manifestVersion}`;
    
    console.log(`📦 Creating ${isBeta ? 'pre-release' : 'release'} ${manifestVersion}...`);
    await retry(async () => {
      run(`gh release create ${manifestVersion} ${assets} --title "${title}" --notes "${notes}" ${prereleaseFlag}`);
    });
    
    if (versions[manifestVersion] !== minAppVersion) {
      versions[manifestVersion] = minAppVersion;
      writeJsonFile(versionFile, versions);
    }

    // Set release success outputs for GitHub Actions
    setGithubOutput('released', 'true');
    setGithubOutput('artifacts', releaseAssets.join('\n'));
    
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n🎉 Success! Release completed in ${duration}s`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Fatal Error: ${errorMessage}`);
    setGithubOutput('released', 'false');
    
    console.log('\n🔄 Rolling back changes...');
    for (const [file, content] of backups) {
      writeFileSync(file, content, 'utf-8');
      console.log(`↩️ Restored ${file}`);
    }
    
    try {
      unlinkSync('main.js');
    } catch {
      // Ignore if main.js was already absent
    }
    
    if (runSilently(`gh release view ${manifestVersion}`)) {
      console.log(`🧹 Cleaning up failed release ${manifestVersion}...`);
      runSilently(`gh release delete ${manifestVersion} --yes --cleanup-tag`);
    }
    
    console.log('✅ Rollback complete');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`) {
  main().catch((err) => {
    console.error('\n💥 Unhandled error:', err);
    process.exit(1);
  });
}

export { main };
