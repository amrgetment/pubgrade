import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DependencySection, PubspecDependency } from './types';

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

  private static parseSection(
    section: any,
    sectionName: DependencySection,
    output: PubspecDependency[],
    skipPackages: string[] = []
  ): void {
    if (!section) return;

    Object.keys(section).forEach((name) => {
      if (skipPackages.includes(name)) return;
      const version = section[name];
      if (typeof version === 'string') {
        output.push({ name, version, section: sectionName });
      }
    });
  }
}
