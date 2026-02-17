import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { updateDependencyVersionInSections } from './pubspecDependencyUpdater';
import { DependencySection } from './types';

export class Updater {
  static async updatePackage(
    pubspecPath: string,
    packageName: string,
    newVersion: string,
    section?: DependencySection
  ): Promise<boolean> {
    try {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const updatedContent = updateDependencyVersionInSections(
        content,
        packageName,
        newVersion,
        section ? [section] : undefined
      );

      if (content === updatedContent) {
        vscode.window.showWarningMessage(`Could not update ${packageName}`);
        return false;
      }

      fs.writeFileSync(pubspecPath, updatedContent, 'utf8');

      // Run flutter pub get
      const cwd = path.dirname(pubspecPath);
      const terminal = vscode.window.createTerminal({ name: 'Flutter Pub Get', cwd });
      terminal.sendText('flutter pub get');
      terminal.show();

      vscode.window.showInformationMessage(`Updated ${packageName} to ${newVersion}`);
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update ${packageName}: ${error}`);
      return false;
    }
  }
}
