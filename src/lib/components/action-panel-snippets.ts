export const matchPatternSnippets = [
  { label: ".*", value: ".*" },
  { label: "(?<name>.*)", value: "(?<name>.*)" },
  { label: "[[dd-dd-dd]]", value: "\\[\\[\\d\\d-\\d\\d-\\d\\d\\]\\]" },
  { label: "S01E01", value: "(?<episode>S\\d\\dE\\d\\d)" },
  { label: "\\d", value: "\\d" },
];
