import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DependencySection, DependencySourceType, PubspecDependency } from './types';

export class PubspecParser {
  static parse(filePath: string): PubspecDependency[] {
    return this.parsePubspec(filePath).dependencies;
  }

  static parsePubspec(filePath: string): { pubspecName?: string; dependencies: PubspecDependency[] } {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(content) as any;

    const pubspecName = typeof doc?.name === 'string' ? doc.name : undefined;
    const dependencies: PubspecDependency[] = [];

    this.parseSection(doc?.dependencies, 'dependencies', dependencies, ['flutter']);
    this.parseSection(doc?.dev_dependencies, 'dev_dependencies', dependencies, ['flutter_test']);
    this.parseSection(doc?.dependency_overrides, 'dependency_overrides', dependencies);

    return { pubspecName, dependencies };
  }

  static cleanVersion(version: string): string {
    // Remove version constraints like ^, >=, etc.
    return version.replace(/^[\^>=<]+/, '').trim();
  }

  private static getDependencyVersionAndType(raw: any): { version: string; sourceType: DependencySourceType } | null {
    if (typeof raw === 'string') {
      return { version: raw, sourceType: 'hosted' };
    }

    if (!raw || typeof raw !== 'object') {
      return null;
    }

    if (typeof raw.path === 'string') {
      return { version: `path:${raw.path}`, sourceType: 'path' };
    }

    if (raw.git !== undefined) {
      if (typeof raw.git === 'string') {
        return { version: `git:${raw.git}`, sourceType: 'git' };
      }

      if (raw.git && typeof raw.git === 'object' && typeof raw.git.url === 'string') {
        return { version: `git:${raw.git.url}`, sourceType: 'git' };
      }

      return { version: 'git', sourceType: 'git' };
    }

    if (raw.hosted !== undefined && typeof raw.version === 'string') {
      return { version: raw.version, sourceType: 'hosted' };
    }

    if (typeof raw.version === 'string') {
      return { version: raw.version, sourceType: 'hosted' };
    }

    return null;
  }

  private static parseSection(
    section: any,
    sectionName: DependencySection,
    output: PubspecDependency[],
    skipPackages: string[] = []
  ): void {
    if (!section) return;

    Object.keys(section).forEach((name) => {
      if (skipPackages.includes(name)) return;
      const parsed = this.getDependencyVersionAndType(section[name]);
      if (parsed) {
        output.push({
          name,
          version: parsed.version,
          section: sectionName,
          sourceType: parsed.sourceType
        });
      }
    });
  }
}
