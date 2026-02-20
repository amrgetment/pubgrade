# Pubgrade

Never miss a package update again. Check for updates, view changelogs, and update with one click.

[📹 Watch demo video](https://pubgrade.dev/pubgrade.mp4)

## 🩵 Want to say "thanks"?

If you like this package, consider checking [UserOrient](https://userorient.com), my side project for Flutter apps to collect feedback from users.

<a href="https://userorient.com" target="_blank">
	<img src="https://www.userorient.com/assets/extras/sponsor.png">
</a>


## Features

- **Sidebar panel** - All packages listed with current and latest versions
- **Outdated detection** - Warning icons and badge count for outdated packages  
- **Changelogs** - Click any package to see what changed between versions
- **One-click updates** - Update to any version directly from changelog (respects `^` constraints)
- **Automatic sorting** - Outdated packages shown first
- **Update type indicators** - Color-coded icons for major (🔴), minor (🟡), and patch (🔵) updates

## Usage

1. Open any Flutter project with `pubspec.yaml`
2. Click the **Pubgrade** icon in Activity Bar (left sidebar)
3. View all dependencies with version info
4. **Outdated packages** (⚠️) shown at top
5. **Click a package** to view changelog
6. **Click "Update to X.X.X"** button to update

## Ignoring packages (and `any` constraints)

If you don’t want Pubgrade to suggest updates for a dependency, you can ignore it:

- Right-click a package → **Ignore Package**
- Or edit workspace settings: `pubgrade.ignoredPackages`

### Packages declared as `any`

Dependencies declared with `any` (example: `intl: any`) are treated as **up to date by default**, because `any` isn’t a pinned version and would otherwise look “always outdated”.

- Setting: `pubgrade.treatAnyAsUpToDate` (default: `true`)

### Focus on packages with updates

Pubgrade hides up-to-date packages by default, so you focus on updates first.
Ignored outdated updates remain visible, alongside actionable updates.

- Setting: `pubgrade.hideUpToDatePackages` (default: `true`)

Notes:

- In monorepo/grouped mode, groups expand by default when this is enabled.
- If a pubspec group has no packages with updates, Pubgrade shows a small placeholder row.

## Monorepos / multiple pubspec.yaml files

By default, Pubgrade reads only the **workspace root** `pubspec.yaml`.

If you work in a monorepo (melos, `packages/*`, `apps/*`, etc.) you can enable scanning **all** pubspecs in the workspace:

- Setting: `pubgrade.scanAllPubspecs` (default: `false`)
- Optional speed tuning: `pubgrade.maxConcurrentRequests` (default: `8`, range: `1`-`20`)

When enabled:

- Pubgrade finds `**/pubspec.yaml` across **all workspace folders** (multi-root supported)
- It ignores pubspecs inside these folders: `build`, `ios`, `macos`, `android`, `windows`, `linux`, `web`
- The tree is grouped by pubspec (group label uses pubspec `name:`; fallback is relative path)
- Pubspec groups are sorted by path with root-level pubspec(s) shown first

### Hide pubspecs from the grouped view

If you have generated or internal packages you don’t want to see, you can hide them from the grouped view:

- Right-click a pubspec group → **Ignore Pubspec**
- Or use **Manage Ignored Pubspecs** in the view toolbar

This stores the relative pubspec paths in the workspace setting `pubgrade.ignoredPubspecs`.

## Packaging (vsce)

To build and create a `.vsix` package for local install or marketplace publishing:

1. Compile:

	`npm run compile`

2. Package:

	`npx vsce package`

If you have `vsce` installed globally, you can also run `vsce package`.

## License

[MIT](LICENSE)
