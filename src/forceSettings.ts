import { ForceFindType } from "./enums";

export class ForceSetting {
  public FindClass: boolean = false;
  public FindMethod: boolean = false;
  public FindMember: boolean = false;
  public FindLocalVariableDefinition = false;
  public ForceFind: ForceFindType;

  constructor(forceFindType: ForceFindType = ForceFindType.None) {
    this.ForceFind = forceFindType;
    this.FindClass = ForceFindType.FindClass === (ForceFindType.FindClass & forceFindType);
    this.FindMethod = ForceFindType.FindMethod === (ForceFindType.FindMethod & forceFindType);
    this.FindMember = ForceFindType.FindMember === (ForceFindType.FindMember & forceFindType);
    this.FindLocalVariableDefinition = ForceFindType.FindLocalVariable === (ForceFindType.FindLocalVariable & forceFindType);
  }

  public isFindClassOrMethod(): boolean {
    return this.FindClass || this.FindMethod;
  }

  public hasFlag(forceFindType: ForceFindType, passIfNone: boolean = true): boolean {
    return (this.ForceFind === ForceFindType.None && passIfNone) || (forceFindType & this.ForceFind) !== 0;
  }

  public hasAnyFlag(forceFindTypes: ForceFindType[]): boolean {
    for (let k = 0; k < forceFindTypes.length; k++) {
      if (this.hasFlag(forceFindTypes[k])) {
        return true;
      }
    }
    return false;
  }

  public getAllFlagsExcept(excludeFlags: ForceFindType[] = []): ForceFindType {
    if (this.ForceFind === ForceFindType.None) {
      return ForceFindType.None;
    }

    let flag = ForceFindType.None;

    if (this.hasFlag(ForceFindType.FindClass, false) && !isExcludedFlag(ForceFindType.FindClass)) {
      flag |= ForceFindType.FindClass;
    }

    if (this.hasFlag(ForceFindType.FindMethod, false) && !isExcludedFlag(ForceFindType.FindMethod)) {
      flag |= ForceFindType.FindMethod;
    }

    if (this.hasFlag(ForceFindType.FindMember, false) && !isExcludedFlag(ForceFindType.FindMember)) {
      flag |= ForceFindType.FindMember;
    }

    if (this.hasFlag(ForceFindType.FindLocalVariable, false) && !isExcludedFlag(ForceFindType.FindLocalVariable)) {
      flag |= ForceFindType.FindLocalVariable;
    }

    return flag;

    function isExcludedFlag(forceFindType: ForceFindType): boolean {
      return excludeFlags && excludeFlags.includes(forceFindType);
    }
  }
}
