import * as vscode from 'vscode';
import * as path from 'path';
import { PubspecParser } from './pubspecParser';
import { PubDevClient } from './pubdevClient';
import { PackageTreeProvider } from './treeProvider';
import { ChangelogView } from './changelogView';
import { Updater } from './updater';
import { PackageInfo, PubspecDependency, IgnoredPackage } from './types';

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
    vscode.commands.registerCommand('pubgrade.updatePackage', async (item) => {
      if (item && item.packageInfo) {
        const pubspecPath = await findPubspecPath();
        if (pubspecPath) {
          const success = await Updater.updatePackage(
            pubspecPath,
            item.packageInfo.name,
            item.packageInfo.latestVersion
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

  // Add click handler for tree items
  context.subscriptions.push(
    vscode.commands.registerCommand('pubgrade.itemClick', async (item) => {
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
}

async function findPubspecPath(): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('No workspace folder open');
    return null;
  }

  const pubspecPath = path.join(workspaceFolders[0].uri.fsPath, 'pubspec.yaml');
  return pubspecPath;
}

async function fetchPackageInfo(
  dep: PubspecDependency,
  ignoredPackages: IgnoredPackage[]
): Promise<PackageInfo | null> {
  try {
    const cleanVersion = PubspecParser.cleanVersion(dep.version);
    const latestVersion = await PubDevClient.getLatestVersion(dep.name);

    if (!latestVersion) {
      return null;
    }

    const isOutdated = PubDevClient.isOutdated(cleanVersion, latestVersion);
    const updateType = PubDevClient.getUpdateType(cleanVersion, latestVersion);
    const ignoredEntry = ignoredPackages.find(pkg => pkg.name === dep.name);
    const isIgnored = Boolean(ignoredEntry);
    const ignoreReason = ignoredEntry?.reason;

    const packageInfo: PackageInfo = {
      name: dep.name,
      currentVersion: cleanVersion,
      latestVersion: latestVersion,
      isOutdated: isOutdated,
      updateType: updateType,
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
  const pubspecPath = await findPubspecPath();
  if (!pubspecPath) return;

  try {
    treeView.badge = undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pubgrade',
        cancellable: false
      },
      async (progress) => {
        const dependencies = PubspecParser.parse(pubspecPath);
        const packages: PackageInfo[] = [];
        const ignoredPackages = getIgnoredPackages();

        // --- 2. Setup the Worker Pool ---
        const queue = [...dependencies]; // Clone the array to act as a queue
        const totalPackages = dependencies.length;
        let processedCount = 0;
        const concurrencyLimit = 4;

        // This worker function runs in a loop as long as the queue has items
        const worker = async () => {
          while (queue.length > 0) {
            const dep = queue.shift(); // Grab the next item
            if (!dep) break;

            // Fetch data
            const result = await fetchPackageInfo(dep, ignoredPackages);
            if (result) {
              packages.push(result);
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
        treeProvider.setPackages(packages);
        updateBadge();
        updateStatusBar();
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to parse pubspec.yaml: ${error}`);
    treeView.badge = undefined;
  }
}

function updateBadge() {
  const outdatedCount = treeProvider.getOutdatedCount();
  if (outdatedCount > 0) {
    treeView.badge = {
      tooltip: `${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''}`,
      value: outdatedCount
    };
  } else {
    treeView.badge = undefined;
  }
}

function updateStatusBar() {
  const outdatedCount = treeProvider.getOutdatedCount();
  if (outdatedCount > 0) {
    statusBarItem.text = `$(warning) ${outdatedCount} outdated package${outdatedCount > 1 ? 's' : ''}`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(check) All packages up to date`;
    statusBarItem.show();
  }
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
        const pubspecPath = await findPubspecPath();
        if (pubspecPath) {
          const success = await Updater.updatePackage(pubspecPath, packageName, version);
          if (success) {
            setTimeout(() => refreshPackages(), 1000);
          }
        }
      }
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

export function deactivate() { }
