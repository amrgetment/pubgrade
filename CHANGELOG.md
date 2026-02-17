# Changelog

## 1.7.3 - Default actionable-only filtering

- `pubgrade.hideUpToDatePackages` now defaults to `true`
- When enabled, Pubgrade hides up-to-date packages and prioritizes actionable updates
- If a pubspec has no actionable updates, ignored updates are shown
- Empty pubspec groups are no longer auto-expanded
- Added an activation notice so users know this is now the default behavior
- Added dependency section awareness (`dependencies`, `dev_dependencies`, `dependency_overrides`) in parsed package metadata
- Fixed updater matching for packages like `patrol` so only dependency section entries are updated (`dependencies`, `dev_dependencies`, `dependency_overrides`), and top-level config blocks (for example `patrol:`) are not modified
- In grouped pubspec view, dependencies are now nested under a section sub-level: `dependencies`, `dev_dependencies`, `dependency_overrides`
- Section labels are shown on package rows in flat/root view, and omitted when already grouped under section nodes

## 1.7.2 - Treat `any` constraints as up-to-date

- New setting: `pubgrade.treatAnyAsUpToDate` (default: `true`)
- Dependencies declared as `any` (e.g. `intl: any`) are treated as up to date by default, so they don’t appear as always-outdated
- Improved tooltip messaging for `any` constraints
- Manifest/schema cleanup (adds missing icons for contributed view/commands)

## 1.7.1 - Hide up-to-date + build version updates

- New setting: `pubgrade.hideUpToDatePackages` to hide packages that are already up to date
- When hiding up-to-date packages in monorepo/grouped mode, pubspec groups expand by default
- Added placeholders for pubspec groups that have no packages with updates
- Version comparison now treats Dart/pub build numbers as updatable (e.g. `1.0.0+2` > `1.0.0+1`)

## 1.7.0 - Monorepo Pubspec Scanning

- Monorepo support (opt-in): scan all `pubspec.yaml` files in the workspace via `pubgrade.scanAllPubspecs` (default: false)
- Results are grouped by pubspec (label from pubspec `name:` with relative-path fallback)
- Pubspec groups are sorted by path with root-level pubspec(s) shown first
- Ignore pubspec groups to hide them from the monorepo scan (workspace setting `pubgrade.ignoredPubspecs`)
- Reduced pub.dev traffic by caching latest-version lookups across pubspecs

## 1.6.0 - Package Ignore Controls

- Ignore/unignore packages directly from the Pubgrade tree with inline actions
- Ignored packages stay visible with an eye-closed icon and are excluded from outdated counts
- Workspace setting `pubgrade.ignoredPackages` stores ignore reasons and can be managed via the new command

## 1.5.0 - Respect Version Constraints

- Updater now respects caret (^) constraints in pubspec.yaml
- If package added as `^4.0.0`, it updates to `^4.0.1` (preserves caret)
- If package added as `4.0.0`, it updates to `4.0.1` (no caret)

## 1.4.0 - Publish Dates & Performance

- Display version dates (e.g., "3 days ago", "2 months ago")
- Worker pool refactoring for improved performance, by [@ziyad-aljohani](https://github.com/ziyad-aljohani).

## 1.3.0 - Version Type Indicators

- Visual indicators for update types: major (red), minor (yellow), and patch (blue) updates
- Informative tooltips explaining the impact of each update type
- Better UX for identifying which updates require more caution
- Thanks to [@ernestjsf](https://github.com/ernestjsf) for the contribution!

## 1.2.0 - Performance Improvements

- Package checking now uses batch processing (4 packages at a time) for ~4x faster performance
- Improved progress reporting with clearer "X of Y packages checked" format
- Fixed progress calculation for accurate completion tracking
- Thanks to [@ziyad-aljohani](https://github.com/ziyad-aljohani) for the contribution!

## 1.1.0 - Icon Added

- This update hopefully adds icon to be seen on VS Code and Cursor marketplace.

## 1.0.1 - Minor Changes

- Update package name to just "Pubgrade"


## 1.0.0 - Initial Release

- Package listing in sidebar
- Outdated package detection
- Changelog viewing
- One-click updates per version
- Badge counter for outdated packages
- Automatic sorting (outdated first)
