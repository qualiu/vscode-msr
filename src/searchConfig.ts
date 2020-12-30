import { getConfigValue } from "./configUtils";
import { IsLinuxTerminalOnWindows } from "./utils";

export class SearchConfiguration {
  public SearchRelativePathForLinuxTerminalsOnWindows: boolean = true;
  public SearchRelativePathForNativeTerminals: boolean = true;

  constructor() {
    this.reload();
  }

  public reload() {
    this.SearchRelativePathForLinuxTerminalsOnWindows = getConfigValue('searchRelativePathForLinuxTerminalsOnWindows') === 'true';
    this.SearchRelativePathForNativeTerminals = getConfigValue('searchRelativePathForNativeTerminals') === 'true';
  }

  public shouldUseRelativeSearchPath(toRunInTerminal: boolean) {
    if (!toRunInTerminal
      || (IsLinuxTerminalOnWindows && !this.SearchRelativePathForLinuxTerminalsOnWindows)
      || (!IsLinuxTerminalOnWindows && !this.SearchRelativePathForNativeTerminals)
    ) {
      return false;
    }

    return true;
  }
}

export let SearchConfig: SearchConfiguration = new SearchConfiguration();
