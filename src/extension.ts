import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PubspecParser } from './pubspecParser';
import { PubDevClient } from './pubdevClient';
import { PackageTreeProvider } from './treeProvider';
import { ChangelogView } from './changelogView';
import { Updater } from './updater';
import { PackageInfo, PubspecDependency, IgnoredPackage, PubspecInfo, PubspecGroup } from './types';

let treeProvider: PackageTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let treeView: vscode.TreeView<any>;

export function activate(context: vscode.ExtensionContext) {
  console.log('Flutter Pubgrade extension activated');

  // Initialize tree provider
  treeProvider = new PackageTreeProvider();
  treeView = vscode.window.createTreeView('pubgradePackages', {
    treeDataProvider: treeProvider
  });

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'pubgrade.refresh';
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.refresh', () => refreshPackages())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.toggleHideUpToDatePackages', async () => {
      const config = vscode.workspace.getConfiguration('pubgrade');
      const current = config.get<boolean>('hideUpToDatePackages', false);
      await config.update('hideUpToDatePackages', !current, vscode.ConfigurationTarget.Workspace);
      vscode.window.setStatusBarMessage(
        !current ? 'Pubgrade: hiding up-to-date packages' : 'Pubgrade: showing all packages',
        2000
      );
      // refreshPackages() is triggered by onDidChangeConfiguration.
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.ignorePubspec', async (item) => {
      const relativePath: string | undefined = item?.group?.pubspec?.relativePath;
      if (relativePath) {
        await ignorePubspec(relativePath);
        return;
      }

      // If invoked from the view toolbar or command palette (no item), prompt.
      await promptIgnorePubspec();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.updatePackage', async (item) => {
      if (item && item.packageInfo) {
        const pubspecPath = item.packageInfo.sourcePubspecPath || await findRootPubspecPath();
        if (pubspecPath) {
          const success = await Updater.updatePackage(
            pubspecPath,
            item.packageInfo.name,
            item.packageInfo.latestVersion,
            item.packageInfo.sourceDependencySection
          );
          if (success) {
            setTimeout(() => refreshPackages(), 1000);
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.showChangelog', async (item) => {
      if (item && item.packageInfo) {
        await showChangelogAsDocument(item.packageInfo);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.ignorePackage', async (item) => {
      if (item && item.packageInfo) {
        await ignorePackage(item.packageInfo.name);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.unignorePackage', async (item) => {
      if (item && item.packageInfo) {
        await unignorePackage(item.packageInfo.name);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.manageIgnoredPackages', async () => {
      await manageIgnoredPackages();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.manageIgnoredPubspecs', async () => {
      await manageIgnoredPubspecs();
    })
  );

  // Add click handler for tree items
  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.itemClick', async (item) => {
      if (!item?.packageInfo) {
        return;
      }
      if (!item.packageInfo.isOutdated) {
        vscode.window.showInformationMessage(`${item.packageInfo.name} is up to date (${item.packageInfo.currentVersion})`);
        return;
      }

      // Directly show changelog
      await showChangelogAsDocument(item.packageInfo);
    })
  );

  // Auto-refresh on activation
  refreshPackages();

  // Auto-refresh when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('pubgrade.hideUpToDatePackages') ||
        e.affectsConfiguration('pubgrade.scanAllPubspecs') ||
        e.affectsConfiguration('pubgrade.treatAnyAsUpToDate') ||
        e.affectsConfiguration('pubgrade.ignoredPubspecs') ||
        e.affectsConfiguration('pubgrade.ignoredPackages')
      ) {
        refreshPackages();
      }
    })
  );
}

function getScanAllPubspecsSetting(): boolean {
  const config = vscode.workspace.getConfiguration('pubgrade');
  return config.get<boolean>('scanAllPubspecs', false);
}

function getIgnoredPubspecs(): string[] {
  const config = vscode.workspace.getConfiguration('pubgrade');
  return config.get<string[]>('ignoredPubspecs', []);
}

function getTreatAnyAsUpToDateSetting(): boolean {
  const config = vscode.workspace.getConfiguration('pubgrade');
  return config.get<boolean>('treatAnyAsUpToDate', true);
}

async function setIgnoredPubspecs(relativePubspecPaths: string[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('pubgrade');
  await config.update('ignoredPubspecs', relativePubspecPaths, vscode.ConfigurationTarget.Workspace);
}

async function findRootPubspecPath(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open');
    return null;
  }

  return path.join(workspaceFolders[0].uri.fsPath, 'pubspec.yaml');
}

async function findPubspecPaths(): Promise<string[] | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open');
    return null;
  }

  const scanAll = getScanAllPubspecsSetting();
  if (!scanAll) {
    const root = await findRootPubspecPath();
    return root ? [root] : null;
  }

  const include = '**/pubspec.yaml';
  const exclude = '**/{build,ios,macos,android,windows,linux,web}/**';
  const pubspecUris = await vscode.workspace.findFiles(include, exclude);
  return pubspecUris.map(u => u.fsPath);
}

async function fetchPackageInfo(
  dep: PubspecDependency,
  ignoredPackages: IgnoredPackage[],
  source: { pubspecPath: string; pubspecName?: string; relativePath?: string }
): Promise<PackageInfo | null> {
  try {
    const cleanVersion = PubspecParser.cleanVersion(dep.version);
    const latestVersion = await PubDevClient.getLatestVersion(dep.name);

    if (!latestVersion) {
      return null;
    }

    const treatAnyAsUpToDate = getTreatAnyAsUpToDateSetting();
    const isAnyConstraint = cleanVersion.trim().toLowerCase() === 'any';

    const isOutdated = (treatAnyAsUpToDate && isAnyConstraint)
      ? false
      : PubDevClient.isOutdated(cleanVersion, latestVersion);

    const updateType = (treatAnyAsUpToDate && isAnyConstraint)
      ? 'none'
      : PubDevClient.getUpdateType(cleanVersion, latestVersion);
    const ignoredEntry = ignoredPackages.find(pkg => pkg.name === dep.name);
    const isIgnored = Boolean(ignoredEntry);
    const ignoreReason = ignoredEntry?.reason;

    const packageInfo: PackageInfo = {
      name: dep.name,
      currentVersion: cleanVersion,
      latestVersion: latestVersion,
      sourceDependencySection: dep.section,
      isOutdated: isOutdated,
      updateType: updateType,
      sourcePubspecPath: source.pubspecPath,
      sourcePubspecName: source.pubspecName,
      sourcePubspecRelativePath: source.relativePath,
      isIgnored: isIgnored,
      ignoreReason: ignoreReason
    };
    return packageInfo;
  } catch (error) {
    console.error(`Error fetching ${dep.name}:`, error);
    return null;
  }
}

async function refreshPackages() {
  const pubspecPaths = await findPubspecPaths();
  if (!pubspecPaths || pubspecPaths.length === 0) return;

  try {
    treeView.badge = undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pubgrade',
        cancellable: false
      },
      async (progress) => {
        const scanAll = getScanAllPubspecsSetting();
        const ignoredPackages = getIgnoredPackages();
        const ignoredPubspecs = getIgnoredPubspecs();

        // Build pubspec metadata + dependency work items.
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        const workspaceRootPubspecPaths = new Set(
          workspaceFolders.map(f => path.join(f.uri.fsPath, 'pubspec.yaml'))
        );

        const pubspecInfos: PubspecInfo[] = [];
        const workItems: Array<{ dep: PubspecDependency; source: { pubspecPath: string; pubspecName?: string; relativePath: string } }> = [];

        for (const p of pubspecPaths) {
          // In non-scanAll mode, fail fast with a helpful message when root pubspec.yaml doesn't exist.
          if (!scanAll && !fs.existsSync(p)) {
            vscode.window.showErrorMessage(
              'Root pubspec.yaml not found. Enable "pubgrade.scanAllPubspecs" to scan sub-packages, or open the folder containing pubspec.yaml.'
            );
            return;
          }

          if (!fs.existsSync(p)) {
            continue;
          }

          const relativePath = vscode.workspace.asRelativePath(p, true);

          // Only relevant in scanAll mode (grouped view). Hide ignored pubspecs.
          if (scanAll && ignoredPubspecs.includes(relativePath)) {
            continue;
          }

          const isWorkspaceRootPubspec = workspaceRootPubspecPaths.has(p);
          const parsed = PubspecParser.parsePubspec(p);

          const info: PubspecInfo = {
            pubspecPath: p,
            pubspecName: parsed.pubspecName,
            relativePath,
            isWorkspaceRootPubspec,
            dependencies: parsed.dependencies
          };
          pubspecInfos.push(info);

          for (const dep of parsed.dependencies) {
            workItems.push({
              dep,
              source: {
                pubspecPath: p,
                pubspecName: parsed.pubspecName,
                relativePath
              }
            });
          }
        }

        // No work? Just clear the tree.
        if (workItems.length === 0) {
          treeProvider.setPackages([]);
          updateBadge(0);
          updateStatusBar(0, 0);
          return;
        }

        const packages: PackageInfo[] = [];
        const packagesByPubspecPath = new Map<string, PackageInfo[]>();

        // --- 2. Setup the Worker Pool ---
        const queue = [...workItems]; // Clone the array to act as a queue
        const totalPackages = workItems.length;
        let processedCount = 0;
        const concurrencyLimit = 4;

        // This worker function runs in a loop as long as the queue has items
        const worker = async () => {
          while (queue.length > 0) {
            const item = queue.shift(); // Grab the next item
            if (!item) break;

            // Fetch data
            const result = await fetchPackageInfo(item.dep, ignoredPackages, item.source);
            if (result) {
              packages.push(result);
              const list = packagesByPubspecPath.get(result.sourcePubspecPath) ?? [];
              list.push(result);
              packagesByPubspecPath.set(result.sourcePubspecPath, list);
            }

            // Report progress immediately after THIS item finishes
            processedCount++;
            progress.report({
              message: `${processedCount} of ${totalPackages} checked`,
              increment: (1 / totalPackages) * 100
            });
          }
        };

        // Create an array of N promises (workers)
        const workers = Array(Math.min(concurrencyLimit, totalPackages))
          .fill(null)
          .map(() => worker());

        // Wait for all workers to drain the queue
        await Promise.all(workers);

        // Finish up
        const actionableOutdatedCount = packages.filter(pkg => pkg.isOutdated && !pkg.isIgnored).length;
        const ignoredOutdatedCount = packages.filter(pkg => pkg.isOutdated && pkg.isIgnored).length;

        if (scanAll && pubspecInfos.length > 1) {
          const groups: PubspecGroup[] = pubspecInfos
            .map(pubspec => ({
              pubspec,
              packages: packagesByPubspecPath.get(pubspec.pubspecPath) ?? []
            }))
            .sort((a, b) => {
              // root pubspec(s) first, then by relative path
              const rootDiff = Number(b.pubspec.isWorkspaceRootPubspec) - Number(a.pubspec.isWorkspaceRootPubspec);
              if (rootDiff !== 0) {
                return rootDiff;
              }
              return a.pubspec.relativePath.localeCompare(b.pubspec.relativePath);
            });

          treeProvider.setGroups(groups);
        } else {
          treeProvider.setPackages(packages);
        }
        updateBadge(actionableOutdatedCount);
        updateStatusBar(actionableOutdatedCount, ignoredOutdatedCount);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to parse pubspec.yaml: ${error}`);
    treeView.badge = undefined;
  }
}

function updateBadge(outdatedCountOverride?: number) {
  const outdatedCount = typeof outdatedCountOverride === 'number'
    ? outdatedCountOverride
    : treeProvider.getOutdatedCount();

  if (outdatedCount > 0) {
    treeView.badge = {
      tooltip: `${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''}`,
      value: outdatedCount
    };
  } else {
    treeView.badge = undefined;
  }
}

function updateStatusBar(outdatedCountOverride?: number, ignoredCountOverride?: number) {
  const actionableCount = typeof outdatedCountOverride === 'number'
    ? outdatedCountOverride
    : treeProvider.getOutdatedCount();

  const ignoredCount = typeof ignoredCountOverride === 'number'
    ? ignoredCountOverride
    : treeProvider.getIgnoredOutdatedCount?.() ?? 0;

  if (actionableCount > 0) {
    statusBarItem.text = `$(warning) ${actionableCount} outdated package${actionableCount > 1 ? 's' : ''}`;
  } else if (ignoredCount > 0) {
    statusBarItem.text = `$(eye-closed) ${ignoredCount} ignored update${ignoredCount > 1 ? 's' : ''}`;
  } else {
    statusBarItem.text = `$(check) All packages up to date`;
  }

  statusBarItem.show();
}

async function showChangelogAsDocument(packageInfo: PackageInfo) {
  try {
    const changelog = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching changelog for ${packageInfo.name}...`,
        cancellable: false
      },
      async () => {
        return await PubDevClient.getChangelog(
          packageInfo.name,
          packageInfo.currentVersion,
          packageInfo.latestVersion
        );
      }
    );

    ChangelogView.show(
      packageInfo.name,
      changelog,
      packageInfo.currentVersion,
      packageInfo.latestVersion,
      async (packageName: string, version: string) => {
        const pubspecPath = packageInfo.sourcePubspecPath || await findRootPubspecPath();
        if (pubspecPath) {
          const success = await Updater.updatePackage(
            pubspecPath,
            packageName,
            version,
            packageInfo.sourceDependencySection
          );
          if (success) {
            setTimeout(() => refreshPackages(), 1000);
          }
        }
      },
      packageInfo.sourcePubspecName
        ? (packageInfo.sourcePubspecRelativePath
          ? `${packageInfo.sourcePubspecName} (${packageInfo.sourcePubspecRelativePath})`
          : packageInfo.sourcePubspecName)
        : (packageInfo.sourcePubspecRelativePath || undefined)
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to fetch changelog: ${error}`);
  }
}

function getIgnoredPackages(): { name: string; reason?: string }[] {
  const config = vscode.workspace.getConfiguration('pubgrade');
  return config.get<{ name: string; reason?: string }[]>('ignoredPackages', []);
}

async function setIgnoredPackages(packages: { name: string; reason?: string }[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('pubgrade');
  await config.update('ignoredPackages', packages, vscode.ConfigurationTarget.Workspace);
}

async function ignorePackage(packageName: string): Promise<void> {
  const reason = await vscode.window.showInputBox({
    prompt: `Why do you want to ignore ${packageName}?`,
    placeHolder: 'e.g., Manual override, dependency conflict, etc. (optional)'
  });

  if (reason === undefined) {
    return; // User cancelled
  }

  const ignoredPackages = getIgnoredPackages();
  if (ignoredPackages.some(pkg => pkg.name === packageName)) {
    vscode.window.showInformationMessage(`${packageName} is already ignored`);
    return;
  }

  ignoredPackages.push({ name: packageName, reason: reason || undefined });
  await setIgnoredPackages(ignoredPackages);
  vscode.window.showInformationMessage(`${packageName} is now ignored`);
  await refreshPackages();
}

async function unignorePackage(packageName: string): Promise<void> {
  const ignoredPackages = getIgnoredPackages();
  const filtered = ignoredPackages.filter(pkg => pkg.name !== packageName);

  if (filtered.length === ignoredPackages.length) {
    vscode.window.showInformationMessage(`${packageName} is not ignored`);
    return;
  }

  await setIgnoredPackages(filtered);
  vscode.window.showInformationMessage(`${packageName} is no longer ignored`);
  await refreshPackages();
}

async function manageIgnoredPackages(): Promise<void> {
  const ignoredPackages = getIgnoredPackages();

  if (ignoredPackages.length === 0) {
    vscode.window.showInformationMessage('No packages are currently ignored');
    return;
  }

  const items = ignoredPackages.map(pkg => ({
    label: pkg.name,
    description: pkg.reason || 'No reason provided',
    pkg: pkg
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a package to unignore',
    canPickMany: true
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const packagesToRemove = selected.map(item => item.pkg.name);
  const filtered = ignoredPackages.filter(pkg => !packagesToRemove.includes(pkg.name));

  await setIgnoredPackages(filtered);
  vscode.window.showInformationMessage(`Unignored ${packagesToRemove.length} package(s)`);
  await refreshPackages();
}

async function ignorePubspec(relativePubspecPath: string): Promise<void> {
  const scanAll = getScanAllPubspecsSetting();
  if (!scanAll) {
    vscode.window.showInformationMessage('Enable "pubgrade.scanAllPubspecs" to manage pubspec groups.');
    return;
  }

  const ignored = getIgnoredPubspecs();
  if (ignored.includes(relativePubspecPath)) {
    vscode.window.showInformationMessage(`${relativePubspecPath} is already ignored`);
    return;
  }

  ignored.push(relativePubspecPath);
  ignored.sort((a, b) => a.localeCompare(b));
  await setIgnoredPubspecs(ignored);
  vscode.window.showInformationMessage(`Ignored pubspec: ${relativePubspecPath}`);
  await refreshPackages();
}

async function promptIgnorePubspec(): Promise<void> {
  const scanAll = getScanAllPubspecsSetting();
  if (!scanAll) {
    vscode.window.showInformationMessage('Enable "pubgrade.scanAllPubspecs" to manage pubspec groups.');
    return;
  }

  const pubspecPaths = await findPubspecPaths();
  if (!pubspecPaths || pubspecPaths.length === 0) {
    vscode.window.showInformationMessage('No pubspec.yaml files found.');
    return;
  }

  const ignored = new Set(getIgnoredPubspecs());

  const items = pubspecPaths
    .filter(p => fs.existsSync(p))
    .map(p => {
      const relativePath = vscode.workspace.asRelativePath(p, true);
      const parsed = PubspecParser.parsePubspec(p);
      const label = parsed.pubspecName || relativePath;
      const description = relativePath;
      return {
        label,
        description,
        relativePath,
        isIgnored: ignored.has(relativePath)
      };
    })
    .filter(i => !i.isIgnored)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  if (items.length === 0) {
    vscode.window.showInformationMessage('All discovered pubspecs are already ignored.');
    return;
  }

  const selected = await vscode.window.showQuickPick(
    items.map(i => ({ label: i.label, description: i.description, value: i.relativePath })),
    { placeHolder: 'Select a pubspec to ignore (hide from groups)' }
  );

  if (!selected) {
    return;
  }

  await ignorePubspec(selected.value);
}

async function manageIgnoredPubspecs(): Promise<void> {
  const ignored = getIgnoredPubspecs();

  if (ignored.length === 0) {
    vscode.window.showInformationMessage('No pubspecs are currently ignored');
    return;
  }

  const items = ignored.map((p) => ({
    label: p,
    description: 'Ignored pubspec (hidden from groups)',
    value: p
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select pubspec(s) to unignore',
    canPickMany: true
  });

  if (!selected || selected.length === 0) {
    return;
  }

  const toRemove = new Set(selected.map(s => s.value));
  const next = ignored.filter(p => !toRemove.has(p));
  await setIgnoredPubspecs(next);
  vscode.window.showInformationMessage(`Unignored ${toRemove.size} pubspec(s)`);
  await refreshPackages();
}

export function deactivate() { }
