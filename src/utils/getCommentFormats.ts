export function getCommentFormats(): {
  singleLine: { [key: string]: RegExp };
  multiLine: { [key: string]: RegExp };
} {
  return {
    singleLine: {
      "//": /\/\/(.+)$/,
      "#": /#(.+)$/,
      "--": /--(.+)$/,
      ";": /;(.+)$/,
    },
    multiLine: {
      cStyle: /\/\*[\s\S]*?\*\//g,
      python: /(?:'''[\s\S]*?''')|(?:"""[\s\S]*?""")/g,
      html: /<!--[\s\S]*?-->/g,
    },
  };
}

export const DEFAULT_EXCLUDED_FOLDERS = [
  "node_modules",
  ".git",
  ".vscode",
  "out",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".nyc_output",
  "logs",
  "tmp",
  "temp",
  ".cache",
];

export function generateExcludePattern(excludedFolders: string[]): string {
  if (!excludedFolders || excludedFolders.length === 0) {
    return `**/{${DEFAULT_EXCLUDED_FOLDERS.join(",")}}/**`;
  }

  return `**/{${excludedFolders.join(",")}}/**`;
}
