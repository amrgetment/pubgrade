import * as vscode from 'vscode';
import * as path from 'path';
import { PubspecParser } from './pubspecParser';
import { PubDevClient } from './pubdevClient';
import { PackageTreeProvider } from './treeProvider';
import { ChangelogView } from './changelogView';
import { Updater } from './updater';
import { PackageInfo } from './types';

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

async function processPackageBatch(dependencies: any[], startIndex: number, batchSize: number): Promise<PackageInfo[]> {
  const batch = dependencies.slice(startIndex, startIndex + batchSize);
  const promises = batch.map(async (dep) => {
    const cleanVersion = PubspecParser.cleanVersion(dep.version);
    const latestVersion = await PubDevClient.getLatestVersion(dep.name);

    if (latestVersion) {
      return {
        name: dep.name,
        currentVersion: cleanVersion,
        latestVersion: latestVersion,
        isOutdated: PubDevClient.isOutdated(cleanVersion, latestVersion)
      };
    }
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter((pkg): pkg is PackageInfo => pkg !== null);
}

async function refreshPackages() {
  const pubspecPath = await findPubspecPath();
  if (!pubspecPath) return;

  try {
    // Clear badge while loading
    treeView.badge = undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pubgrade:',
        cancellable: false
      },
      async (progress) => {
        const dependencies = PubspecParser.parse(pubspecPath);
        const packages: PackageInfo[] = [];
        const batchSize = 4;
        const totalBatches = Math.ceil(dependencies.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const startIndex = batchIndex * batchSize;
          const endIndex = Math.min(startIndex + batchSize, dependencies.length);
          const actualBatchSize = endIndex - startIndex;
          
          progress.report({
            message: `${endIndex} of ${dependencies.length} packages checked`,
            increment: (actualBatchSize / dependencies.length) * 100
          });

          const batchResults = await processPackageBatch(dependencies, startIndex, batchSize);
          packages.push(...batchResults);
        }

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
        // Handle update button click
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

export function deactivate() {}
