export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  isOutdated: boolean;
  changelog?: string;
}

export interface PubspecDependency {
  name: string;
  version: string;
  isDev: boolean;
}

