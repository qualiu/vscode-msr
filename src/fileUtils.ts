import fs = require('fs');
import path = require('path');

import { outputErrorByTime, outputInfoByDebugModeByTime, outputInfoByTime } from "./outputUtils";
import { getErrorMessage } from './utils';

export function saveTextToFile(filePath: string, text: string, info: string = 'file', checkSkipSameContent: boolean = true, tryTimes: number = 3): boolean {
  for (let k = 1; k <= tryTimes; k++) {
    try {
      createDirectory(path.dirname(filePath));
      if (checkSkipSameContent) {
        const existingContent = readTextFile(filePath);
        if (existingContent === text) {
          return true;
        }
      }
      fs.writeFileSync(filePath, text);
      if (k > 1) {
        outputInfoByTime('Times-' + k + ': Successfully saved ' + info + ': ' + filePath);
      }
      return true;
    } catch (err) {
      outputErrorByTime('Times-' + k + ': Failed to save ' + info + ': ' + filePath + ' Error: ' + err);
      if (k >= tryTimes) {
        return false;
      }
    }
  }

  return false;
}

export function readTextFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) {
      outputInfoByDebugModeByTime(`Not found file: ${filePath}`);
      return '';
    }
    const text = fs.readFileSync(filePath);
    return !text ? '' : text.toString();
  } catch (err) {
    outputErrorByTime('Failed to read file: ' + filePath + ', error: ' + err);
    return '';
  }
}

export function createDirectory(folder: string): boolean {
  if (fs.existsSync(folder)) {
    return true;
  }

  try {
    const parentDir = path.dirname(folder);
    createDirectory(parentDir);
    fs.mkdirSync(folder);
    return true;
  } catch (err) {
    outputErrorByTime('Failed to make single script folder: ' + folder + ' Error: ' + err);
    return false;
  }
}

export function getFileModifyTime(filePath: string, invalidYearSubtract: number = 10): Date {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime;
  } catch (err) {
    let invalidTime = new Date();
    invalidTime.setFullYear(invalidTime.getFullYear() - invalidYearSubtract);
    return invalidTime;
  }
}

export function isSymbolicLink(path: string): boolean {
  try {
    const stat = fs.lstatSync(path);
    return stat.isSymbolicLink();
  } catch (err) {
    outputInfoByDebugModeByTime('Failed to check link of file: ' + path + ', error: ' + getErrorMessage(err));
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    const stat = fs.lstatSync(path);
    return stat.isDirectory();
  } catch (err) {
    outputInfoByDebugModeByTime('Failed to check link of file: ' + path + ', error: ' + getErrorMessage(err));
    return false;
  }
}

export function isFileExists(path: string): boolean {
  try {
    const stat = fs.lstatSync(path);
    return stat.isFile();
  } catch (err) {
    outputInfoByDebugModeByTime('Failed to check link of file: ' + path + ', error: ' + getErrorMessage(err));
    return false;
  }
}