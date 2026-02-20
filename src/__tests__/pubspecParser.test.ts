import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PubspecParser } from '../pubspecParser';

test('parses dependencies, dev_dependencies, and dependency_overrides with section metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubgrade-parser-'));
  const pubspecPath = path.join(tempDir, 'pubspec.yaml');

  const pubspecContent = [
    'name: demo',
    'dependencies:',
    '  dio: ^5.0.0',
    'dev_dependencies:',
    '  test: ^1.24.0',
    'dependency_overrides:',
    '  patrol: ^4.2.0',
    ''
  ].join('\n');

  fs.writeFileSync(pubspecPath, pubspecContent, 'utf8');

  const parsed = PubspecParser.parsePubspec(pubspecPath);
  const byName = new Map(parsed.dependencies.map((d) => [d.name, d]));

  assert.equal(byName.get('dio')?.section, 'dependencies');
  assert.equal(byName.get('test')?.section, 'dev_dependencies');
  assert.equal(byName.get('patrol')?.section, 'dependency_overrides');
});

test('parses hosted, path, and git dependency source types', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubgrade-parser-'));
  const pubspecPath = path.join(tempDir, 'pubspec.yaml');

  const pubspecContent = [
    'name: demo',
    'dependencies:',
    '  dio: ^5.0.0',
    '  my_local_pkg:',
    '    path: ../my_local_pkg',
    '  my_git_pkg:',
    '    git:',
    '      url: https://github.com/acme/my_git_pkg.git',
    ''
  ].join('\n');

  fs.writeFileSync(pubspecPath, pubspecContent, 'utf8');

  const parsed = PubspecParser.parsePubspec(pubspecPath);
  const byName = new Map(parsed.dependencies.map((d) => [d.name, d]));

  assert.equal(byName.get('dio')?.sourceType, 'hosted');
  assert.equal(byName.get('my_local_pkg')?.sourceType, 'path');
  assert.equal(byName.get('my_git_pkg')?.sourceType, 'git');
});
