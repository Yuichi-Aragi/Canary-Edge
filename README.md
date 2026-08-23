***

[![Security scan](https://github.com/Yuichi-Aragi/Canary-Edge/actions/workflows/codeql.yml/badge.svg)](https://github.com/Yuichi-Aragi/Canary-Edge/actions/workflows/codeql.yml) [![GitHub issues](https://img.shields.io/github/issues/Yuichi-Aragi/Canary-Edge?color=f85149)](https://github.com/Yuichi-Aragi/Canary-Edge/issues) [![GitHub closed issues](https://img.shields.io/github/issues-closed/Yuichi-Aragi/Canary-Edge?color=8250df)](https://github.com/Yuichi-Aragi/Canary-Edge/issues?q=is%3Aissue+is%3Aclosed)



# Canary Edge

**Made for control freaks.**

Obsidian is built on extensibility. The Official Community Store is excellent for stability, and BRAT established the baseline for testing plugins directly from GitHub. But for a specific subset of users—those who need granular data, precise version control, and debugging tools—standard options leave just enough friction to be annoying.

Canary Edge (CE) is a modern alternative plugin built in direct response to BRAT. **It is not BRAT, nor is it a "modern BRAT."** It is an intentional, modern alternative utility.

**It is NOT a full-fledged plugin manager, nor will it ever become one.** Canary Edge will remain strictly a single-purpose tool focused entirely on testing and tracking git-based plugins—doing one thing with uncompromising precision.

**Who is this for?**
*   **Developers, Testers, and Advanced Users:** CE is strictly for those who know what a GitHub Personal Access Token (PAT) is and know their way around browser/app DevTools.
*   **Power Users Wanting More:** CE is strictly for those who have used BRAT and the official plugin manager and *still* found themselves wanting deeper control, transparency, and configurability.
*   **Prior Experience Required:** If you have never used BRAT or a third-party developer-focused plugin manager before, **please avoid Canary Edge**. Without prior experience, CE's density and granular control can be overwhelming.
*   **Keep It Simple if You Don't Need This:** If the official plugin manager and BRAT already satisfy your use case and you don't want any added complexity, please avoid installing CE.


## The Middle Ground

Canary Edge occupies the space between basic utility and over-engineered decoration. It is built for actual power users who value intentionality, transparency, and control.

*   **Vs. BRAT:** Built in response to BRAT's limitations, CE provides a far more granular management surface. While BRAT handles both plugins and themes, **CE does not support themes.** CE focuses exclusively on the plugin ecosystem, offering deeper per-plugin configuration, explicit release prioritization, extended version selection, live compatibility auditing, and advanced debugging workflows.
*   **Not a Full-Fledged Plugin Manager:** CE does not aim to replace Obsidian's core plugin manager or act as a total vault organizer. It stays strictly a single-purpose tool—just like BRAT—focused on tracking, testing, and controlling non-store or beta plugin releases.
*   **Vs. Other Managers:** Many third-party tools focus heavily on visual organization and aesthetic decoration. **CE rejects this.** There is no renaming of plugins, no custom descriptions, and no theme support. CE is solely focused on plugin UX, execution control, and functional diagnostics.



## The Concept & Aesthetic Philosophy

### A Floating Command Center
Canary Edge abandons the traditional, buried "Settings Tab" architecture. Instead, it introduces a **Floating Window** triggered via the Ribbon or Command Palette. This window is fully resizable and movable, keeping your diagnostics visible alongside your work.

### Deliberate Design
The visual aesthetic of Canary Edge is a deliberate design choice. It was not created to look radically different from Obsidian or other community plugins simply for the sake of novelty; rather, the interface is a direct byproduct of CE's core philosophy—functional density, immediate diagnostic feedback, and zero clutter. We will not make major compromises or changes to this aesthetic because it is the very soul of Canary Edge.

### Mobile-First from Day One
Unlike many power-user tools that treat mobile as an afterthought, Canary Edge was built with a **mobile-first architecture**. The UI is optimized for touch targets, gesture-based navigation, and responsive layouts. Whether you are on a 32-inch monitor or a 6-inch phone, the "cockpit" remains fully functional, ensuring mobile debugging is never a second-class experience.



## Key Features

### 1. Granular Management & Overrides
By default, CE delivers a comprehensive **global and per-plugin settings override experience**. Configure default behavior for your entire CE-registered plugin collection, or override specific rules on a plugin-by-plugin basis.

*   **GitHub PAT Control & Real-Time Diagnostics:** 
    *   **Recommendation:** **Always configure your personal GitHub PAT.** Canary Edge consumes significantly more GitHub API requests than BRAT as a direct architectural side effect of keeping you thoroughly informed through inline changelogs, tag version histories, pre-flight compatibility checks, and README documentation parsing. 
    *   Managing API limits shouldn't be a guessing game. CE displays live diagnostic data—including real-time rate limit status and active token permissions—for your global GitHub PAT. To handle specialized repositories or isolated accounts, CE allows you to set or override PATs globally as well as on a **per-plugin basis**.
*   **Deep Version Selection:** BRAT arbitrarily limits tag history during release selection. CE breaks past this ceiling, allowing you to load more historical versions directly inside the version picker so you can pinpoint, inspect, or downgrade to any historic release effortlessly.
*   **Release Prioritization:** Choose to prioritize **Beta** or **Stable** releases on a per-plugin basis.
*   **Dual Incompatibility Overrides:** BRAT lumps compatibility bypasses together. CE splits them into two distinct, independent settings:
    1.  **Override Platform Only:** Bypass platform/app version restrictions to force plugins to load regardless of OS or target environment checks.
    2.  **Override Obsidian API:** Bypass minimum Obsidian API requirements at your own risk.
*   **Update Control:** Set specific update checks—at a set interval, on startup (`onload`), or both. By default, CE automatically downloads updated assets as soon as a new version is detected; users can disable auto-download in settings if they prefer to receive update notifications only.
*   **Freeze Plugin:** Lock a plugin at its current working version with a single click to prevent accidental updates.



### 2. Changelog Workflows & Compatibility Verification

Never install, reinstall, upgrade, or downgrade blindly. Canary Edge gives you total control over how changes and compatibility warnings are verified.

#### Changelog Workflow Modes
*   **`Before` Configuration (Recommended):** When changelog display is set to `Before`, CE initiates a pre-flight audit. It halts execution and prompts you for explicit confirmation to proceed by presenting the full changelog, the README (optionally), and a **Plugin Info Card** detailing version and compatibility status. **No assets are downloaded to your vault until you confirm.**
*   **`After` Configuration:** When changelog display is set to `After`, CE downloads and applies the update automatically, displaying the changelog afterward as an informational follow-up without requesting permission.
*   **Changelog Source Prioritization:** Change settings to prioritize either release notes or a repository changelog file (e.g., `CHANGELOG.md`). CE will factor this priority in when fetching changelogs for any release.

#### Pre-Install Compatibility Checks (Install Panel)
Want to know if a plugin is compatible with your vault *before* downloading?
*   When you enter a GitHub repository URL and press **Enter** to verify, CE fetches the manifest for the selected release.
*   A **Plugin Card** renders at the top of the interface displaying metadata and an explicit **compatibility indicator**.
*   If the target version is incompatible with your current Obsidian build or OS, it is clearly flagged immediately.
*   This Plugin Card **automatically updates whenever you switch the selected release version**, eliminating blind installations.

#### Upgrade & Downgrade Compatibility Checks (Settings Panel)
Want to check compatibility when adjusting versions of already tracked plugins?
*   **With Changelog set to `Before` (Recommended):** Triggering an upgrade, reinstall, or downgrade will automatically render the changelog and the top Plugin Card (showing live compatibility status) to request confirmation before any asset transactions occur.
*   **Direct Audit via Settings:** Even if changelogs are not set to `Before`, you can audit any release manually:
    1. Open **Canary Edge** $\rightarrow$ **Dashboard**.
    2. Navigate to **Settings** $\rightarrow$ **Version & Auth** category for the target plugin.
    3. Select any release version from the dropdown.
    4. A **Plugin Card** automatically appears above the selection rendering all relevant release info and the **compatibility tag**.
    5. If you still wish to proceed with an incompatible release, you can adjust that plugin's specific incompatibility overrides (Platform and API Version) to install that version directly without repeated confirmation blockers.



### 3. Search & Pre-Install Auditing
Unlike BRAT, you do not need to constantly hunt down full repository URLs or guess what you are pulling:
*   **Pre-Installation Inspection (README & Changelog):** Inspect the target release's documentation and changelog directly within the panel before committing any files.
*   **Universal GitHub URL Scrubbing:** You should never have to manually edit, clean, or prune a repository link just to appease a tool that requires an exact `user/repo` syntax. CE includes an intelligent URL scrubbing engine that automatically parses almost any link format you paste—including full browser URLs, deep sub-links (e.g., `/tree/main`, `/releases/tag/v1.0.0`, `/blob/...`), shorthand (`user/repo`), SSH cloning strings (`git@github.com:...`), raw endpoints, or GitHub API links. It extracts the clean repository target automatically without requiring any manual text editing.



### 4. Dashboard Context Actions
In the Dashboard section, you can **right-click** (desktop) or **press and hold** (mobile) on any tracked plugin's title to open a dedicated context drop-down menu with quick-action utilities:
*   **Copy the repository url:** Instantly grab the clean repository URL to your clipboard.
*   **Open a feature request:** Navigate directly to the repository's feature request creation page.
*   **Open an issue:** Open a new GitHub issue ticket directly in your browser.


### 5. Register Untracked Plugins in One Click
If you already have untracked plugins installed in your vault (whether enabled or disabled), you don't need to pivot back to the native installation panel to register them in CE:
1. Open **Canary Edge**.
2. Open the **Navigation Menu** at the top-left corner.
3. Select **Dashboard**.
4. Open the **Filter Menu** at the top-right corner (adjacent to the `+` icon).
5. Select **Untracked**.

From here, you can register any installed plugin into CE's tracking engine in a single click.


## Engineering Standards, Security & Network Scope

Canary Edge is built to the highest standards of modern plugin development. We prioritize security and code health to ensure your vault remains a fortress.

*   **Strict Network Scope:** Canary Edge strictly limits its network communication to two official, trusted endpoints:
    1.  **GitHub (`https://github.com`)**: Communicated with exclusively through the official GitHub **Octokit** SDK to fetch repository metadata, manifests, releases, assets, changelogs, and READMEs.
    2.  **Obsidian Community Directory (`https://community.obsidian.md`)**: Used solely to cross-reference and verify official community plugin registry data.
    *   *There are zero third-party telemetry endpoints, external tracking servers, or unverified remote calls.* You can verify this yourself by checking the repo.
*   **CodeQL Analysis:** Our codebase is continuously scanned using GitHub’s **CodeQL** to identify vulnerabilities and maintain professional-grade code integrity.
*   **Obsidian ESLint Compliant:** Canary Edge is fully compliant with official Obsidian ESLint plugin rules, ensuring optimal performance and seamless integration with the host environment.


## What Canary Edge is NOT

To maintain strict focus and high performance, CE intentionally limits its scope:
*   **NOT a Full-Fledged Plugin Manager:** It will never attempt to manage native plugins or replace native store features.
*   **No Theme Support:** CE handles plugins only.
*   **No Renaming:** Plugins retain their official manifest names.
*   **No Custom Descriptions:** Displayed details come straight from the developer's documentation.
*   **No Folders or Organization:** CE is an engineering cockpit, not a filing cabinet.
*   **No Native Skinning:** CE maintains its own distinct, high-contrast functional aesthetic rather than imitating default Obsidian theme styles.



## Coexistence & BRAT Migration

**Zero-Risk Trial.**
You can install Canary Edge alongside your existing tools, test it, and decide if it fits your workflow.
*   **Coexistence:** CE is designed to coexist peacefully alongside BRAT without conflicts.
*   **Non-Destructive:** Removing Canary Edge will never touch your existing BRAT setup or corrupt plugins installed through other means.
*   **Configurable BRAT Migration:** Upon launch, CE can automatically detect and migrate your tracked plugins from BRAT. If you prefer a clean slate, **automatic BRAT migration can be disabled in settings**.



## Philosophy & Contribution

This project is opinionated.

> We built this because we wanted a tool like this to exist in this obsidian community.

**We do not accept code contributions.**
Please do not open Pull Requests. This project will live and die strictly with its creators, `Yuichi-Aragi` and `Lae-Aragi`.

However, we believe in open software. If our vision does not align with yours, or if you want to take this in a different direction, **please fork it.** You do not even need to credit us.

**Issues & Suggestions**
While we don't accept external code, we do listen. If you find bugs or have feature requests, feel free to open a GitHub Issue.



## Support

We don't do coffee. Maintenance of Canary Edge depends entirely on whether people are actually using it. We built this for ourselves, but we will maintain it for the community if interest persists.

If you want to support the project, **Star the Repo.** Watching that number go up is all the motivation we need.

***
