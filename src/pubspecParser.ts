import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { PubspecDependency } from './types';

export class PubspecParser {
  static parse(filePath: string): PubspecDependency[] {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(content) as any;
    const dependencies: PubspecDependency[] = [];

    // Parse dependencies
    if (doc.dependencies) {
      Object.keys(doc.dependencies).forEach(name => {
        if (name === 'flutter') return; // Skip flutter SDK
        const version = doc.dependencies[name];
        if (typeof version === 'string') {
          dependencies.push({ name, version, isDev: false });
        }
      });
    }

    // Parse dev_dependencies
    if (doc.dev_dependencies) {
      Object.keys(doc.dev_dependencies).forEach(name => {
        if (name === 'flutter_test') return; // Skip flutter test SDK
        const version = doc.dev_dependencies[name];
        if (typeof version === 'string') {
          dependencies.push({ name, version, isDev: true });
        }
      });
    }

    return dependencies;
  }

  static cleanVersion(version: string): string {
    // Remove version constraints like ^, >=, etc.
    return version.replace(/^[\^>=<]+/, '').trim();
  }
}

