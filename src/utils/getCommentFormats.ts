export function getCommentFormats(ext: string): RegExp[] {
  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
      return [
        /^\s*\/\/.*$/,
        /^\s*\/\*.*\*\/\s*$/,
        /^\s*\/\*.*$/,
        /^\s*\*\/\s*$/,
        /^\s*\*[^/].*$/,
      ];
    case "py":
    case "ipynb":
      return [/^\s*#.*/, /^\s*""".*/, /^\s*'''.*/, /^\s*"""/];
    case "rb":
      return [/^\s*#.*/, /^\s*=begin.*/, /^\s*=end/];
    case "lua":
      return [/^\s*--.*/, /^\s*--\[\[.*/, /^\s*\]\]/];
    case "html":
    case "xml":
    case "svg":
      return [/^\s*<!--.*/, /^\s*-->/];
    case "md":
    case "mdx":
    case "markdown":
      return [
        /^\s*<!--.*/,
        /^\s*-->/,
        /^\s*\[comment\]:\s*#.*/,
        /^\s*\[\/\/\]:\s*#.*/,
      ];
    case "sql":
      return [/^\s*--.*/, /^\s*#.*/, /^\s*\/\*.*/];
    case "css":
    case "scss":
    case "less":
      return [/^\s*\/\*.*/, /^\s*\*\//, /^\s*\*.*/];
    case "hs":
      return [/^\s*--.*/, /^\s*{-.*/, /^\s*-}/];
    case "lisp":
    case "clj":
      return [/^\s*;.*/];
    case "vim":
      return [/^\s*".*/];
    case "c":
    case "cpp":
    case "h":
    case "hpp":
    case "cs":
    case "java":
    case "swift":
    case "kt":
    case "scala":
      return [
        /^\s*\/\/.*$/,
        /^\s*\/\*.*\*\/\s*$/,
        /^\s*\/\*.*$/,
        /^\s*\*\/\s*$/,
        /^\s*\*[^/].*$/,
      ];
    case "php":
      return [
        /^\s*\/\/.*$/,
        /^\s*#.*$/,
        /^\s*\/\*.*\*\/\s*$/,
        /^\s*\/\*.*$/,
        /^\s*\*\/\s*$/,
        /^\s*\*[^/].*$/,
      ];
    default:
      return [
        /^\s*\/\/.*$/,
        /^\s*\/\*.*\*\/\s*$/,
        /^\s*\/\*.*$/,
        /^\s*\*\/\s*$/,
        /^\s*\*[^/].*$/,
        /^\s*#.*$/,
      ];
  }
}
