import { ResultType, ScoreTypeResult } from '../ScoreTypeResult';
import { SearchChecker } from '../searchChecker';
import { ClassResultFilter } from './ClassResultFilter';
import { ClassResultFilterForCSharp } from './ClassResultFilterForCSharp';

export function filterClassResults(highValueResults: ScoreTypeResult[], searchInfo: SearchChecker): ScoreTypeResult[] {
  if (!highValueResults || highValueResults.length < 1 || highValueResults[0].Type !== ResultType.Class) {
    return highValueResults;
  }

  let results: ScoreTypeResult[] = [];
  const classResultFilter = createFilter(searchInfo);
  if (!classResultFilter) {
    return highValueResults;
  }

  highValueResults.forEach((a) => {
    if (a.Type === ResultType.Class) {
      if (classResultFilter && classResultFilter.hasDefinedNamespace(a.Location.uri.fsPath)) {
        results.push(a);
      }
    }
  });

  return results.length > 0 ? results : highValueResults;
}

function createFilter(searchInfo: SearchChecker): ClassResultFilter | null {
  let classResultFilter: ClassResultFilter | null = null;
  const extension = searchInfo.extension || '';
  if (/^(cs|cshtml)$/i.exec(extension)) {
    classResultFilter = new ClassResultFilterForCSharp(searchInfo);
  }

  return classResultFilter;
}