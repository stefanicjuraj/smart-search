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

export const FILE_PATTERNS = {
  ALL_FILES: "**/*.{js,ts,jsx,tsx,html,css,md,json,py,java,c,cpp,h,hpp,ipynb}",
  DOCUMENTATION:
    "**/*.{md,mdx,rst,txt,markdown,mdown,markdn,textile,rdoc,org,creole,wiki,dokuwiki,mediawiki,pod,adoc,asciidoc,asc}",
  CONFIGURATION:
    "**/*.{json,yaml,yml,ini,toml,xml,conf,config,env,properties,props,plist,cfg,rc}",
  CODE_FILES:
    "**/*.{js,ts,jsx,tsx,java,c,cpp,cs,go,php,py,rb,rs,swift,kt,scala,h,hpp,m,mm,jade,pug,vue,svelte,html,css,scss,less,dart,lua,md,mdx,markdown,ipynb}",
  NOTEBOOKS: "**/*.ipynb",
};

export const FILE_EXTENSIONS = {
  C_STYLE_LANGUAGES: [
    "js",
    "ts",
    "jsx",
    "tsx",
    "java",
    "c",
    "cpp",
    "cs",
    "go",
    "php",
    "swift",
    "kt",
    "scala",
    "css",
    "scss",
    "less",
  ],
  HASH_COMMENT_LANGUAGES: ["py", "rb", "sh", "bash", "zsh", "yml", "yaml"],
  DASH_COMMENT_LANGUAGES: ["sql", "lua"],
  SEMICOLON_COMMENT_LANGUAGES: ["lisp", "clj", "scm"],
  MARKUP_LANGUAGES: ["html", "xml", "svg", "md", "mdx", "markdown"],
  PYTHON_LIKE: ["py"],
  NOTEBOOKS: ["ipynb"],
};

export const SEARCH_LIMITS = {
  MAX_FILES_TO_SEARCH: 50,
  MAX_RESULTS_PER_SEARCH: 50,
  MAX_CONFIG_FILES_TO_SEARCH: 15,
  MAX_CONFIG_CONTENT_RESULTS: 25,
  MAX_DOC_CONTENT_RESULTS: 25,
};

export function generateExcludePattern(excludedFolders: string[]): string {
  if (!excludedFolders || excludedFolders.length === 0) {
    return `**/{${DEFAULT_EXCLUDED_FOLDERS.join(",")}}/**`;
  }

  return `**/{${excludedFolders.join(",")}}/**`;
}

export function getFileExtension(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() || "";
}

export function getFileName(filePath: string): string {
  return filePath.split("/").pop() || "";
}

export function hasSubstantialContent(
  lineText: string,
  query: string
): boolean {
  const meaningfulContent = lineText
    .replace(new RegExp(query, "gi"), "")
    .trim();
  return lineText.length > query.length + 5 || meaningfulContent.length > 0;
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
