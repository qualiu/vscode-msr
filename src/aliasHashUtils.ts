import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { TerminalType } from './enums';
import { outputDebugByTime } from './outputUtils';

let extensionContext: vscode.ExtensionContext | undefined;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export function getExtensionContext(): vscode.ExtensionContext | undefined {
  return extensionContext;
}

function getAliasHashStorageKey(terminalType: TerminalType): string {
  return `aliasHash_${TerminalType[terminalType]}`;
}

export function getStoredAliasHash(terminalType: TerminalType): string {
  if (!extensionContext) {
    outputDebugByTime('Extension context not set, cannot get stored alias hash');
    return '';
  }
  const key = getAliasHashStorageKey(terminalType);
  return extensionContext.globalState.get<string>(key) || '';
}

export async function saveAliasHash(terminalType: TerminalType, hash: string): Promise<void> {
  if (!extensionContext) {
    outputDebugByTime('Extension context not set, cannot save alias hash');
    return;
  }
  const key = getAliasHashStorageKey(terminalType);
  await extensionContext.globalState.update(key, hash);
  outputDebugByTime(`Saved alias hash for ${TerminalType[terminalType]}: ${hash.substring(0, 16)}...`);
}

export function calculateAliasHash(cmdAliasMap: Map<string, string>): string {
  const sortedKeys = Array.from(cmdAliasMap.keys()).sort();
  const content = sortedKeys.map(key => `${key}=${cmdAliasMap.get(key)}`).join('\n');
  return crypto.createHash('md5').update(content).digest('hex');
}

export function hasAliasChanged(terminalType: TerminalType, newHash: string): boolean {
  const storedHash = getStoredAliasHash(terminalType);
  const changed = storedHash !== newHash;
  if (changed) {
    outputDebugByTime(`Alias hash changed for ${TerminalType[terminalType]}: stored=${storedHash.substring(0, 16) || 'none'}, new=${newHash.substring(0, 16)}`);
  }
  return changed;
}