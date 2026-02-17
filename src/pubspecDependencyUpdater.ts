import { DependencySection } from './types';

export function updateDependencyVersionInSections(
  content: string,
  packageName: string,
  newVersion: string,
  targetSections?: DependencySection[]
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);

  let activeSectionIndent: number | null = null;
  let inDependencySection = false;
  const targetSectionSet = new Set<DependencySection>(targetSections ?? [
    'dependencies',
    'dev_dependencies',
    'dependency_overrides'
  ]);

  const escapedPackageName = escapeRegExp(packageName);
  const dependencyLineRegex = new RegExp(`^(\\s*${escapedPackageName}\\s*:\\s*)(\\^?)([^#\\r\\n]+?)(\\s*)(#.*)?$`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const sectionMatch = line.match(/^([ \t]*)(dependencies|dev_dependencies|dependency_overrides)\s*:\s*(#.*)?$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[2] as DependencySection;
      inDependencySection = targetSectionSet.has(sectionName);
      activeSectionIndent = sectionMatch[1].length;
      continue;
    }

    if (!inDependencySection || activeSectionIndent === null) {
      continue;
    }

    // Inside dependency sections, empty lines and comments are allowed.
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      continue;
    }

    const lineIndent = line.match(/^[ \t]*/)?.[0].length ?? 0;
    if (lineIndent <= activeSectionIndent) {
      inDependencySection = false;
      activeSectionIndent = null;
      continue;
    }

    lines[i] = line.replace(dependencyLineRegex, (_match, prefix: string, caret: string, _version: string, spacing: string, comment: string) => {
      return `${prefix}${caret}${newVersion}${spacing}${comment ?? ''}`;
    });
  }

  return lines.join(newline);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
