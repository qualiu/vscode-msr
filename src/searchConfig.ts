import { getConfigValueOfActiveProject } from "./configUtils";
import { IsLinuxTerminalOnWindows } from "./terminalUtils";

export class SearchConfiguration {
  public SearchRelativePathForLinuxTerminalsOnWindows: boolean = true;
  public SearchRelativePathForNativeTerminals: boolean = true;

  constructor() {
    this.reload();
  }

  public reload() {
    this.SearchRelativePathForLinuxTerminalsOnWindows = getConfigValueOfActiveProject('searchRelativePathForLinuxTerminalsOnWindows') === 'true';
    this.SearchRelativePathForNativeTerminals = getConfigValueOfActiveProject('searchRelativePathForNativeTerminals') === 'true';
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
