import fs = require('fs');
import { outputError, outputInfo } from "./outputUtils";
import { nowText } from "./utils";

export function saveTextToFile(filePath: string, text: string, info: string = 'file', tryTimes: number = 3): boolean {
  for (let k = 1; k <= tryTimes; k++) {
    try {
      fs.writeFileSync(filePath, text);
      if (k > 1) {
        outputInfo(nowText() + 'Times-' + k + ': Successfully saved ' + info + ': ' + filePath);
      }
      return true;
    } catch (err) {
      outputError(nowText() + 'Times-' + k + ': Failed to save ' + info + ': ' + filePath + ' Error: ' + err);
      if (k >= tryTimes) {
        return false;
      }
    }
  }

  return false;
}