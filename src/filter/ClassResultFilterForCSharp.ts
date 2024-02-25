import { isNullOrEmpty } from '../constants';
import { SearchChecker } from '../searchChecker';
import { ClassResultFilter } from './ClassResultFilter';
import fs = require('fs');

export class ClassResultFilterForCSharp extends ClassResultFilter {
  private readonly GetUsedNamespacesRegex: RegExp = /^\s*using\s+((?<Alias>\w+\S+)\s*=\s*)?(?<Namespace>\w+\S+)\s*;/;
  private readonly GetNamespaceDefinitionRegex: RegExp = /^\s*namespace\s+(?<Namespace>[\w\.]+)/mg;

  protected UsedNamespaces: Set<string> = new Set<string>();
  constructor(
    protected readonly SearchInfo: SearchChecker
  ) {
    super(SearchInfo);
    this.getUsedNamespaces();
  }

  protected getUsedNamespaces(): void {
    this.UsedNamespaces.clear();
    const explicitUsedNamespaceRegex: RegExp = new RegExp(String.raw`\b(\w+[\.\w]+)\.` + this.SearchInfo.currentWord + String.raw`\b`);
    const aliasToNamespaceMap = new Map<string, string>();

    // vscode.workspace.openTextDocument(sourceFilePath).then((document) => {
    var allText: string = fs.readFileSync(this.SearchInfo.currentFilePath).toString();
    var lines = allText.split(/\r?\n/);
    for (let k = this.SearchInfo.Position.line - 1; k >= 0; k--) {
      const match = this.GetUsedNamespacesRegex.exec(lines[k]);
      if (match && match.groups) {
        const alias = match.groups['Alias'];
        const namespace = match.groups['Namespace'];
        this.UsedNamespaces.add(namespace);
        if (!isNullOrEmpty(alias)) {
          aliasToNamespaceMap.set(alias, namespace);
        }
      }
    }

    const explicitMatch = explicitUsedNamespaceRegex.exec(this.SearchInfo.currentText);
    if (explicitMatch && explicitMatch.length > 0) {
      const namespace = aliasToNamespaceMap.get(explicitMatch[1]) || explicitMatch[1];
      this.UsedNamespaces.clear();
      this.UsedNamespaces.add(namespace);
      return;
    }
  }

  public hasDefinedNamespace(resultFilePath: string): boolean {
    const allText = fs.readFileSync(resultFilePath).toString();
    let match: RegExpExecArray | null = null;
    while ((match = this.GetNamespaceDefinitionRegex.exec(allText)) != null) {
      if (match.groups && this.UsedNamespaces.has(match.groups['Namespace'])) {
        return true;
      }
    }

    return false;
  }
}
