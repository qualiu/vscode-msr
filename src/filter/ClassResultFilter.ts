import { SearchChecker } from '../searchChecker';

export abstract class ClassResultFilter {
  constructor(
    protected readonly SearchInfo: SearchChecker) {
  }

  protected abstract getUsedNamespaces(): void;
  public abstract hasDefinedNamespace(resultFilePath: string): boolean;
}
