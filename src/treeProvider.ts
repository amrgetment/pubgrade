import * as vscode from 'vscode';
import { PackageInfo, PubspecGroup } from './types';

function getHideUpToDatePackagesSetting(): boolean {
  return vscode.workspace.getConfiguration('pubgrade').get<boolean>('hideUpToDatePackages', false);
}

export class PubspecTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: PubspecGroup,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(group.pubspec.pubspecName || group.pubspec.relativePath, collapsibleState);

    const displayPath = group.pubspec.relativePath;
    this.description = displayPath !== this.label ? displayPath : undefined;
    this.tooltip = displayPath;
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'pubspecGroup';
    // Intentionally no click command: clicking expands/collapses.
  }
}

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
      if (packageInfo.currentVersion.trim().toLowerCase() === 'any') {
        this.tooltip = "Version constraint is 'any' (not tracked for updates)";
      } else {
        this.tooltip = 'Up to date';
      }
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

export class PlaceholderTreeItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
    this.contextValue = 'placeholder';
    this.tooltip = label;
  }
}

export type PubgradeTreeItem = PubspecTreeItem | PackageTreeItem | PlaceholderTreeItem;

export class PackageTreeProvider implements vscode.TreeDataProvider<PubgradeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PubgradeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: PackageInfo[] = [];
  private groups: PubspecGroup[] | null = null;
  private groupByPath: Map<string, PubspecGroup> = new Map();

  setPackages(packages: PackageInfo[]) {
    this.groups = null;
    this.groupByPath.clear();
    this.packages = packages;
    this._onDidChangeTreeData.fire();
  }

  setGroups(groups: PubspecGroup[]) {
    this.groups = groups;
    this.groupByPath = new Map(groups.map(g => [g.pubspec.pubspecPath, g]));
    // Keep a flattened list for counts/badges.
    this.packages = groups.flatMap(g => g.packages);
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

  getTreeItem(element: PubgradeTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PubgradeTreeItem): Thenable<PubgradeTreeItem[]> {
    const hideUpToDate = getHideUpToDatePackagesSetting();

    if (!element) {
      if (this.groups) {
        const sortedGroups = [...this.groups].sort((a, b) => {
          // Root pubspecs first
          const rootDiff = Number(b.pubspec.isWorkspaceRootPubspec) - Number(a.pubspec.isWorkspaceRootPubspec);
          if (rootDiff !== 0) {
            return rootDiff;
          }
          return a.pubspec.relativePath.localeCompare(b.pubspec.relativePath);
        });

        return Promise.resolve(
          sortedGroups.map(g => new PubspecTreeItem(
            g,
            hideUpToDate ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
          ))
        );
      }

      const priority = (pkg: PackageInfo): number => {
        if (pkg.isOutdated && !pkg.isIgnored) {
          return 0; // actionable updates first
        }
        if (pkg.isIgnored) {
          return 1; // ignored packages before fully up-to-date
        }
        return 2; // up-to-date items last
      };

      const visiblePackages = hideUpToDate
        ? this.packages.filter(p => p.isOutdated)
        : this.packages;

      const sorted = [...visiblePackages].sort((a, b) => {
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

    if (element instanceof PubspecTreeItem) {
      const group = this.groupByPath.get(element.group.pubspec.pubspecPath);
      const packages = group?.packages ?? [];
      const visiblePackages = hideUpToDate
        ? packages.filter(p => p.isOutdated)
        : packages;

      if (hideUpToDate && visiblePackages.length === 0) {
        return Promise.resolve([
          new PlaceholderTreeItem('No packages with updates in this pubspec')
        ]);
      }

      const priority = (pkg: PackageInfo): number => {
        if (pkg.isOutdated && !pkg.isIgnored) {
          return 0;
        }
        if (pkg.isIgnored) {
          return 1;
        }
        return 2;
      };

      const sorted = [...visiblePackages].sort((a, b) => {
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

