import * as vscode from 'vscode';
import { PackageInfo } from './types';

export class PackageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly packageInfo: PackageInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(packageInfo.name, collapsibleState);

    if (packageInfo.isIgnored) {
      const baseDescription = `${packageInfo.currentVersion} (ignored)`;
      this.description = packageInfo.ignoreReason ? `${baseDescription}\n${packageInfo.ignoreReason}` : baseDescription;
      this.iconPath = new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('descriptionForeground'));
      const reasonLine = packageInfo.ignoreReason ? `\nReason: ${packageInfo.ignoreReason}` : '';
      this.tooltip = `Ignored - Updates will not be shown${reasonLine}`;
      this.contextValue = 'ignoredPackage';
    } else if (packageInfo.isOutdated) {
      this.description = `${packageInfo.currentVersion} → ${packageInfo.latestVersion}`;

      // Set icon and tooltip based on update type
      switch (packageInfo.updateType) {
        case 'major':
          this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
          this.tooltip = `Major update available: ${packageInfo.latestVersion} (Breaking changes possible)`;
          break;
        case 'minor':
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `Minor update available: ${packageInfo.latestVersion} (New features)`;
          break;
        case 'patch':
          this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
          this.tooltip = `Patch update available: ${packageInfo.latestVersion} (Bug fixes)`;
          break;
        default:
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `Update available: ${packageInfo.latestVersion}`;
      }
      this.contextValue = 'outdatedPackage';
    } else {
      this.description = packageInfo.currentVersion;
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      this.tooltip = 'Up to date';
      this.contextValue = 'upToDatePackage';
    }

    // Add click command
    this.command = {
      command: 'pubgrade.itemClick',
      title: 'Package Actions',
      arguments: [this]
    };
  }
}

export class PackageTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: PackageInfo[] = [];

  setPackages(packages: PackageInfo[]) {
    this.packages = packages;
    this._onDidChangeTreeData.fire();
  }

  getOutdatedCount(): number {
    return this.packages.filter(p => p.isOutdated && !p.isIgnored).length;
  }

  getIgnoredOutdatedCount(): number {
    return this.packages.filter(p => p.isOutdated && p.isIgnored).length;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PackageTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PackageTreeItem): Thenable<PackageTreeItem[]> {
    if (!element) {
      const priority = (pkg: PackageInfo): number => {
        if (pkg.isOutdated && !pkg.isIgnored) {
          return 0; // actionable updates first
        }
        if (pkg.isIgnored) {
          return 1; // ignored packages before fully up-to-date
        }
        return 2; // up-to-date items last
      };

      const sorted = [...this.packages].sort((a, b) => {
        const diff = priority(a) - priority(b);
        if (diff !== 0) {
          return diff;
        }
        return a.name.localeCompare(b.name);
      });

      return Promise.resolve(
        sorted.map(pkg => new PackageTreeItem(pkg, vscode.TreeItemCollapsibleState.None))
      );
    }
    return Promise.resolve([]);
  }
}

