export type UpdateType = 'major' | 'minor' | 'patch' | 'none';

export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  updateType: UpdateType;
  changelog?: string;
  isIgnored?: boolean;
}

export interface PubspecDependency {
  name: string;
  version: string;
  isDev: boolean;
}

export interface IgnoredPackage {
  name: string;
  reason?: string;
}

