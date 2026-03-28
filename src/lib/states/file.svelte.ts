export class File {
  name = $state("");
  newName = $state("");
  ignore = $state(false);
  matchError = $state(false);
  renameError = $state("");
  overridePattern = $state("");

  constructor(name: string) {
    this.name = name;
  }
}
