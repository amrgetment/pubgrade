export type UpdateType = 'major' | 'minor' | 'patch' | 'none';
export type DependencySection = 'dependencies' | 'dev_dependencies' | 'dependency_overrides';

export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  sourceDependencySection: DependencySection;
  isOutdated: boolean;
  updateType: UpdateType;
  /** Absolute path to the pubspec.yaml that declared this dependency. */
  sourcePubspecPath: string;
  /** Optional display label for the pubspec (usually pubspec `name:`). */
  sourcePubspecName?: string;
  /** Optional relative path (used for grouping/sorting). */
  sourcePubspecRelativePath?: string;
  changelog?: string;
  isIgnored?: boolean;
  ignoreReason?: string;
  publishedDate?: Date;
}

export interface PubspecDependency {
  name: string;
  version: string;
  section: DependencySection;
}

export interface PubspecInfo {
  /** Absolute path to pubspec.yaml */
  pubspecPath: string;
  /** Value of the pubspec `name:` key, if present */
  pubspecName?: string;
  /** Relative path used for sorting/label fallback */
  relativePath: string;
  /** Whether this pubspec.yaml is directly under a workspace folder root */
  isWorkspaceRootPubspec: boolean;
  dependencies: PubspecDependency[];
}

export interface PubspecGroup {
  pubspec: PubspecInfo;
  packages: PackageInfo[];
}

export interface IgnoredPackage {
  name: string;
  reason?: string;
}
