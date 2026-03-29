import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { DependencySection, DependencySourceType, PubspecDependency } from './types';

const EXCLUDED_DIRS = ['build', '.dart_tool', '.symlinks', '.plugin_symlinks', 'ios', 'android', 'web', 'macos', 'linux', 'windows', '.fvm'];

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

  // Extracts the "name:" field from pubspec.yaml (the project/package name)
  static getProjectName(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const doc = yaml.load(content) as any;
      if (doc?.name) return doc.name;
    } catch {}
    // Fallback to directory name
    return path.basename(path.dirname(filePath));
  }

  // Finds all pubspec.yaml files in the workspace, skipping generated/platform dirs
  static async findAllPubspecs(workspaceRoot: string): Promise<string[]> {
    const vscode = await import('vscode');
    const pattern = new vscode.RelativePattern(workspaceRoot, '**/pubspec.yaml');
    const uris = await vscode.workspace.findFiles(pattern, `{${EXCLUDED_DIRS.map(d => `**/${d}/**`).join(',')}}`);
    return uris.map(u => u.fsPath).sort();
  }

  static parseLockFile(pubspecPath: string): Map<string, string> | null {
    const lockPath = path.join(path.dirname(pubspecPath), 'pubspec.lock');
    if (!fs.existsSync(lockPath)) return null;

    const doc = yaml.load(fs.readFileSync(lockPath, 'utf8')) as any;
    const versions = new Map<string, string>();

    if (doc?.packages) {
      for (const [name, info] of Object.entries<any>(doc.packages)) {
        if (info?.version) {
          versions.set(name, info.version);
        }
      }
    }

    return versions;
  }

  static cleanVersion(version: string): string {
    return version.replace(/^[\^>=<]+/, '').trim();
  }

  private static getDependencyVersionAndType(raw: any): { version: string; sourceType: DependencySourceType; hasCaret: boolean } | null {
    if (typeof raw === 'string') {
      return {
        version: raw,
        sourceType: 'hosted',
        hasCaret: raw.trimStart().startsWith('^')
      };
    }

    if (!raw || typeof raw !== 'object') {
      return null;
    }

    if (typeof raw.path === 'string') {
      return { version: `path:${raw.path}`, sourceType: 'path', hasCaret: false };
    }

    if (raw.git !== undefined) {
      if (typeof raw.git === 'string') {
        return { version: `git:${raw.git}`, sourceType: 'git', hasCaret: false };
      }

      if (raw.git && typeof raw.git === 'object' && typeof raw.git.url === 'string') {
        return { version: `git:${raw.git.url}`, sourceType: 'git', hasCaret: false };
      }

      return { version: 'git', sourceType: 'git', hasCaret: false };
    }

    if (raw.hosted !== undefined && typeof raw.version === 'string') {
      return {
        version: raw.version,
        sourceType: 'hosted',
        hasCaret: raw.version.trimStart().startsWith('^')
      };
    }

    if (typeof raw.version === 'string') {
      return {
        version: raw.version,
        sourceType: 'hosted',
        hasCaret: raw.version.trimStart().startsWith('^')
      };
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
          sourceType: parsed.sourceType,
          hasCaret: parsed.hasCaret
        });
      }
    });
  }
}
