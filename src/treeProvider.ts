import * as vscode from 'vscode';
import { DependencySection, PackageInfo, PubspecGroup } from './types';

function getHideUpToDatePackagesSetting(): boolean {
  return vscode.workspace.getConfiguration('pubgrade').get<boolean>('hideUpToDatePackages', true);
}

const SECTION_ORDER: DependencySection[] = [
  'dependencies',
  'dev_dependencies',
  'dependency_overrides'
];

const SECTION_EMOJI: Record<DependencySection, string> = {
  dependencies: '📦',
  dev_dependencies: '🧪',
  dependency_overrides: '🧰'
};

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

export class DependencySectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: PubspecGroup,
    public readonly section: DependencySection,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    count: number
  ) {
    super(`${SECTION_EMOJI[section]} ${section}`, collapsibleState);
    this.description = `${count} package${count === 1 ? '' : 's'}`;
    this.tooltip = `${SECTION_EMOJI[section]} ${section}`;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.contextValue = 'dependencySectionGroup';
  }
}

export class PackageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly packageInfo: PackageInfo,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    showSectionLabel: boolean = true
  ) {
    super(packageInfo.name, collapsibleState);
    const sectionLabel = showSectionLabel
      ? PackageTreeItem.getSectionLabel(packageInfo.sourceDependencySection)
      : undefined;
    const sectionPrefix = sectionLabel ? `${SECTION_EMOJI[packageInfo.sourceDependencySection]} ${sectionLabel} ` : '';
    const sectionTooltipLine = sectionLabel ? `\nSection: ${sectionLabel}` : '';
    const sourceInfo = PackageTreeItem.getSourceInfo(packageInfo.sourceDependencyType);
    const sourceLine = sourceInfo ? ` ${sourceInfo.emoji}` : '';
    const sourceTooltipLine = sourceInfo ? `\n${sourceInfo.emoji} ${sourceInfo.label}` : '';
    const cleanedCurrentVersion = packageInfo.currentVersion || 'unknown';

    if (packageInfo.isIgnored) {
      const baseDescription = `${sectionPrefix}🚫 ${cleanedCurrentVersion} (ignored)${sourceLine}`;
      this.description = packageInfo.ignoreReason ? `${baseDescription}\n${packageInfo.ignoreReason}` : baseDescription;
      this.iconPath = new vscode.ThemeIcon('eye-closed', new vscode.ThemeColor('descriptionForeground'));
      const reasonLine = packageInfo.ignoreReason ? `\nReason: ${packageInfo.ignoreReason}` : '';
      this.tooltip = `🚫 ignored package${sectionTooltipLine}${sourceTooltipLine}${reasonLine}`;
      this.contextValue = 'ignoredPackage';
    } else if (packageInfo.fetchFailed) {
      this.description = `${sectionPrefix}❌ fetch failed${sourceLine}`;
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      this.tooltip = `❌ fetch failed${sectionTooltipLine}${sourceTooltipLine}`;
      this.contextValue = 'fetchFailedPackage';
    } else if (packageInfo.isOutdated) {
      const updateEmoji = PackageTreeItem.getUpdateEmoji(packageInfo.updateType);
      const updateEmojiPart = updateEmoji ? `${updateEmoji} ` : '';
      this.description = `${sectionPrefix}${updateEmojiPart}${cleanedCurrentVersion} → ${packageInfo.latestVersion}${sourceLine}`;

      // Set icon and tooltip based on update type
      switch (packageInfo.updateType) {
        case 'major':
          this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
          this.tooltip = `🔥 major update${sectionTooltipLine}${sourceTooltipLine}`;
          break;
        case 'minor':
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `🌱 minor update${sectionTooltipLine}${sourceTooltipLine}`;
          break;
        case 'patch':
          this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
          this.tooltip = `🩹 patch update${sectionTooltipLine}${sourceTooltipLine}`;
          break;
        default:
          this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
          this.tooltip = `update available${sectionTooltipLine}${sourceTooltipLine}`;
      }
      this.contextValue = 'outdatedPackage';
    } else {
      this.description = `${sectionPrefix}✅ ${cleanedCurrentVersion}${sourceLine}`;
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      if (packageInfo.currentVersion.trim().toLowerCase() === 'any') {
        this.tooltip = `✅ up-to-date package\nVersion constraint is 'any' (not tracked for updates)${sectionTooltipLine}${sourceTooltipLine}`;
      } else {
        this.tooltip = `✅ up-to-date package${sectionTooltipLine}${sourceTooltipLine}`;
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

  private static getSectionLabel(
    section: PackageInfo['sourceDependencySection'] | string | undefined
  ): string | undefined {
    if (!section) return undefined;
    const value = section.trim();
    return value.length > 0 ? value : undefined;
  }

  private static getSourceInfo(
    sourceType: PackageInfo['sourceDependencyType']
  ): { emoji: string; label: string } | undefined {
    switch (sourceType) {
      case 'hosted':
        return undefined;
      case 'path':
        return { emoji: '🧱', label: 'local/path dependency' };
      case 'git':
        return { emoji: '🔧', label: 'git dependency' };
      default:
        return undefined;
    }
  }

  private static getUpdateEmoji(updateType: PackageInfo['updateType']): string {
    switch (updateType) {
      case 'major':
        return '🔥';
      case 'minor':
        return '🌱';
      case 'patch':
        return '🩹';
      default:
        return '';
    }
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

export type PubgradeTreeItem =
  | PubspecTreeItem
  | DependencySectionTreeItem
  | PackageTreeItem
  | PlaceholderTreeItem;

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

  private getVisiblePackages(packages: PackageInfo[], hideUpToDate: boolean): PackageInfo[] {
    if (!hideUpToDate) {
      return packages;
    }

    // Hide only up-to-date packages; keep all outdated entries visible,
    // including ignored ones, so users can still see what is being skipped.
    // Keep fetch failures visible so dependency lookup issues are explicit.
    return packages.filter(p => p.isOutdated || p.fetchFailed);
  }

  private getSectionPackages(
    packages: PackageInfo[],
    section: DependencySection
  ): PackageInfo[] {
    return packages.filter(pkg => pkg.sourceDependencySection === section);
  }

  private getSectionItems(
    group: PubspecGroup,
    visiblePackages: PackageInfo[],
    hideUpToDate: boolean
  ): DependencySectionTreeItem[] {
    return SECTION_ORDER
      .map((section) => {
        const sectionPackages = this.getSectionPackages(visiblePackages, section);
        if (sectionPackages.length === 0) {
          return null;
        }

        return new DependencySectionTreeItem(
          group,
          section,
          hideUpToDate ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
          sectionPackages.length
        );
      })
      .filter((item): item is DependencySectionTreeItem => item !== null);
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
          sortedGroups.map(g => {
            const visiblePackages = this.getVisiblePackages(g.packages, hideUpToDate);
            const collapsibleState = visiblePackages.length === 0
              ? vscode.TreeItemCollapsibleState.None
              : hideUpToDate
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;

            return new PubspecTreeItem(g, collapsibleState);
          })
        );
      }

      const priority = (pkg: PackageInfo): number => {
        if (pkg.isOutdated && !pkg.isIgnored) {
          return 0; // actionable updates first
        }
        if (pkg.fetchFailed && !pkg.isIgnored) {
          return 1; // lookup failures next
        }
        if (pkg.isIgnored) {
          return 2; // ignored packages before fully up-to-date
        }
        return 3; // up-to-date items last
      };

      const visiblePackages = this.getVisiblePackages(this.packages, hideUpToDate);

      const sorted = [...visiblePackages].sort((a, b) => {
        const diff = priority(a) - priority(b);
        if (diff !== 0) {
          return diff;
        }
        return a.name.localeCompare(b.name);
      });

      return Promise.resolve(
        sorted.map(pkg => new PackageTreeItem(pkg, vscode.TreeItemCollapsibleState.None, true))
      );
    }

    if (element instanceof PubspecTreeItem) {
      const group = this.groupByPath.get(element.group.pubspec.pubspecPath);
      const packages = group?.packages ?? [];
      const visiblePackages = this.getVisiblePackages(packages, hideUpToDate);
      if (visiblePackages.length === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve(this.getSectionItems(element.group, visiblePackages, hideUpToDate));
    }

    if (element instanceof DependencySectionTreeItem) {
      const group = this.groupByPath.get(element.group.pubspec.pubspecPath);
      const packages = group?.packages ?? [];
      const visiblePackages = this.getVisiblePackages(packages, hideUpToDate);
      const sectionPackages = this.getSectionPackages(visiblePackages, element.section);

      const priority = (pkg: PackageInfo): number => {
        if (pkg.isOutdated && !pkg.isIgnored) {
          return 0;
        }
        if (pkg.isIgnored) {
          return 1;
        }
        return 2;
      };

      const sorted = [...sectionPackages].sort((a, b) => {
        const diff = priority(a) - priority(b);
        if (diff !== 0) {
          return diff;
        }
        return a.name.localeCompare(b.name);
      });

      return Promise.resolve(
        sorted.map(pkg => new PackageTreeItem(pkg, vscode.TreeItemCollapsibleState.None, false))
      );
    }

    return Promise.resolve([]);
  }
}
