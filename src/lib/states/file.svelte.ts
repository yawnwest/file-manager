export class File {
  name = $state("");
  newName = $state("");
  ignore = $state(false);
  overridePattern = $state("");

  constructor(name: string) {
    this.name = name;
  }
}
