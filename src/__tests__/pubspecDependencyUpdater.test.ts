import test from 'node:test';
import assert from 'node:assert/strict';
import { updateDependencyVersionInSections } from '../pubspecDependencyUpdater';

test('updates patrol only in dev_dependencies and keeps patrol config section unchanged', () => {
  const input = [
    'dev_dependencies:',
    '  patrol: ^4.1.1',
    '  #custom_lint_builder: ^0.8.1',
    '',
    'patrol:',
    '  # Default Patrol flavor for local smoke runs. Override with --flavor as needed.',
    '  flavor: dev',
    '  test_directory: patrol_test',
    '  android:',
    '    package_name: io.getment.dev',
    '  ios:',
    '    bundle_id: io.getment.dev',
    ''
  ].join('\n');

  const output = updateDependencyVersionInSections(input, 'patrol', '4.2.0', ['dev_dependencies']);

  assert.match(output, /dev_dependencies:\n  patrol: \^4\.2\.0/);
  assert.match(output, /\npatrol:\n  # Default Patrol flavor/);
  assert.match(output, /\n  flavor: dev\n/);
  assert.match(output, /\n    package_name: io\.getment\.dev\n/);
});

test('updates only the selected section when the same package exists in multiple sections', () => {
  const input = [
    'dev_dependencies:',
    '  patrol: ^4.1.1',
    '',
    'dependency_overrides:',
    '  patrol: ^4.0.0',
    ''
  ].join('\n');

  const output = updateDependencyVersionInSections(input, 'patrol', '4.2.0', ['dependency_overrides']);

  assert.match(output, /dev_dependencies:\n  patrol: \^4\.1\.1/);
  assert.match(output, /dependency_overrides:\n  patrol: \^4\.2\.0/);
});

test('updates package in dependencies without touching same key outside dependency sections', () => {
  const input = [
    'name: demo',
    'dependencies:',
    '  foo: 1.0.0',
    '',
    'foo:',
    '  nested: value',
    ''
  ].join('\n');

  const output = updateDependencyVersionInSections(input, 'foo', '2.0.0');

  assert.match(output, /dependencies:\n  foo: 2\.0\.0/);
  assert.match(output, /\nfoo:\n  nested: value\n/);
});

test('preserves caret and inline comments when updating', () => {
  const input = [
    'dependencies:',
    '  bar: ^1.2.3  # keep me',
    ''
  ].join('\n');

  const output = updateDependencyVersionInSections(input, 'bar', '9.9.9');

  assert.equal(output, ['dependencies:', '  bar: ^9.9.9  # keep me', ''].join('\n'));
});
