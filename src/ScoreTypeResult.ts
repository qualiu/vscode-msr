import * as vscode from 'vscode';

export enum ResultType {
  None = 0,
  LocalVariable,
  ConstantValue,
  Member,
  Method,
  Interface,
  Enum,
  Class
}

export const InvalidLocation = new vscode.Location(vscode.Uri.file('Invalid-Location-Cost'), new vscode.Position(0, 0));

export class ScoreTypeResult {
  public Score: Number = 0;
  public Type: ResultType;
  public ResultText: string = '';
  public Location: vscode.Location;

  constructor(score: Number, type: ResultType, resultText: string, location: vscode.Location = InvalidLocation) {
    this.Score = score;
    this.Type = type;
    this.ResultText = resultText;
    this.Location = location;
  }
}