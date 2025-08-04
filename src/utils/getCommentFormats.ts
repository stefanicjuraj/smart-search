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
  // Version Control
  ".git",
  ".hg",
  ".svn",

  // IDEs and Editors
  ".vscode",
  ".idea",
  ".eclipse",
  ".settings",
  ".vs",
  ".vscode-test",

  // JavaScript/Node.js
  "node_modules",
  ".next",
  ".nuxt",
  ".vercel",
  ".netlify",
  ".cache",
  ".parcel-cache",
  "dist",
  "build",
  "out",
  ".output",

  // Python
  "__pycache__",
  ".pytest_cache",
  ".tox",
  ".coverage",
  ".mypy_cache",
  ".dmypy.json",
  "venv",
  "env",
  ".venv",
  ".env",
  "site-packages",
  ".eggs",
  "*.egg-info",

  // Java
  "target",
  ".gradle",
  ".m2",
  "bin",
  "classes",
  ".classpath",
  ".project",
  ".factorypath",
  ".apt_generated",

  // Kotlin
  ".kotlin",
  "kotlin-js-store",

  // Go
  "vendor",
  "go.work.sum",

  // Rust
  "target",
  "Cargo.lock",

  // C/C++
  "cmake-build-debug",
  "cmake-build-release",
  ".cmake",
  "CMakeFiles",
  "CMakeCache.txt",

  // .NET/C#
  "bin",
  "obj",
  "packages",
  ".nuget",

  // Ruby
  ".bundle",
  "vendor/bundle",
  ".gem",

  // PHP
  "vendor",
  ".composer",

  // Android
  ".gradle",
  "build",
  ".externalNativeBuild",
  ".cxx",
  "local.properties",

  // iOS/Swift
  "DerivedData",
  ".build",
  "Pods",

  // Flutter/Dart
  ".dart_tool",
  ".flutter-plugins",
  ".flutter-plugins-dependencies",
  ".packages",
  ".pub-cache",
  ".pub",
  "build",

  // Testing and Coverage
  "coverage",
  ".nyc_output",
  ".coverage",
  "htmlcov",
  "test-results",
  "allure-results",

  // Logs and Temporary files
  "logs",
  "tmp",
  "temp",
  ".tmp",
  "*.log",

  // Docker
  ".docker",
  "docker-compose.override.yml",

  // Terraform
  ".terraform",
  "*.tfstate",
  "*.tfplan",

  // System files
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",

  // Documentation generators
  "_site",
  ".jekyll-cache",
  ".sass-cache",
  "docs/_build",
  ".sphinx-build",

  // Package managers lockfiles and caches
  "yarn.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "Pipfile.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
];

export const FILE_PATTERNS = {
  ALL_FILES:
    "**/*.{js,ts,jsx,tsx,vue,svelte,html,css,scss,sass,less,md,json,py,java,c,cpp,h,hpp,cs,go,rs,rb,php,kt,scala,swift,m,mm,dart,lua,sh,bash,zsh,ps1,bat,sql,r,R,matlab,pl,hs,elm,clj,fs,ml,ex,erl,nim,cr,jl,zig,v,d,pas,asm,f90,pro,vhd,tcl,lisp,coffee,pug,hbs,styl,makefile,dockerfile,ipynb,rmd,org,tex}",

  DOCUMENTATION:
    "**/*.{md,mdx,rst,txt,markdown,mdown,markdn,textile,rdoc,org,creole,wiki,dokuwiki,mediawiki,pod,adoc,asciidoc,asc,texi,texinfo,man,roff,help,rtf,latex,tex,bib,readme,changelog,license,todo}",

  CONFIGURATION:
    "**/*.{json,yaml,yml,toml,ini,cfg,conf,config,properties,props,plist,env,dotenv,editorconfig,gitignore,gitattributes,dockerignore,eslintrc,prettierrc,babelrc,browserslistrc,postcssrc,stylelintrc,jshintrc,flowconfig,yarnrc,npmrc,nvmrc,nycrc,mocharc,webpackconfig,rollupconfig,gulpfile,gruntfile,makefile,cmake,cmakelists,vcxproj,csproj,sln,pubspec,podspec,gemspec,setup,requirements,pipfile,pyproject,conda,tox,pytest,mypy,travis,circleci,appveyor,docker-compose,vagrantfile,procfile,manifest,package,bower,composer,cargo,go.mod,go.sum,build.gradle,pom.xml,settings.gradle,application.properties,web.xml,persistence.xml}",

  CODE_FILES:
    "**/*.{js,ts,jsx,tsx,vue,svelte,coffee,mjs,cjs,java,kt,groovy,scala,clj,cljs,c,cpp,cxx,cc,h,hpp,hxx,cs,vb,fs,fsx,ml,mli,py,pyx,pyi,rb,rbw,rake,go,rs,php,php3,swift,m,mm,r,R,matlab,pl,pm,perl,hs,lhs,elm,ex,exs,erl,hrl,nim,cr,jl,zig,v,d,pas,asm,s,f,f90,f95,for,pro,idl,vhd,vhdl,sv,tcl,tk,lisp,scm,rkt,lua,sh,bash,zsh,fish,ps1,bat,cmd,sql,pug,jade,hbs,handlebars,mustache,twig,erb,haml,slim,styl,stylus,postcss,dockerfile,vagrantfile,rakefile,gemfile,podfile,fastfile,ipynb,rmd,qmd,org,tex,bib}",

  NOTEBOOKS: "**/*.{ipynb,rmd,Rmd,qmd,org,jl,nb,mathematica,wl,wxm}",

  SCRIPTS:
    "**/*.{sh,bash,zsh,fish,csh,tcsh,ksh,ps1,psm1,bat,cmd,py,rb,pl,php,js,ts,lua,tcl,awk,make,gradle,rake,gulp,grunt}",

  DATA_FILES:
    "**/*.{csv,tsv,json,jsonl,xml,yaml,yml,sql,db,sqlite,parquet,pickle,pkl,h5,mat,rds,xlsx,xls,ods}",
};

export const FILE_EXTENSIONS = {
  // Languages that use C-style comments (/* */ and //)
  C_STYLE_LANGUAGES: [
    "js",
    "ts",
    "jsx",
    "tsx",
    "mjs",
    "cjs",
    "coffee",
    "java",
    "kt",
    "kts",
    "groovy",
    "scala",
    "c",
    "cpp",
    "cxx",
    "cc",
    "c++",
    "h",
    "hpp",
    "hxx",
    "hh",
    "h++",
    "cs",
    "vb",
    "fs",
    "fsx",
    "go",
    "rs",
    "php",
    "php3",
    "php4",
    "php5",
    "phtml",
    "swift",
    "m",
    "mm",
    "dart",
    "css",
    "scss",
    "sass",
    "less",
    "styl",
    "stylus",
    "postcss",
    "json",
    "jsonc",
    "json5",
    "d",
    "zig",
    "v",
    "asm",
    "s",
    "S",
  ],

  // Languages that use # for comments
  HASH_COMMENT_LANGUAGES: [
    "py",
    "pyx",
    "pyi",
    "pyw",
    "pyz",
    "rb",
    "rbw",
    "rake",
    "thor",
    "jbuilder",
    "sh",
    "bash",
    "zsh",
    "fish",
    "csh",
    "tcsh",
    "ksh",
    "ash",
    "dash",
    "yml",
    "yaml",
    "r",
    "R",
    "perl",
    "pl",
    "pm",
    "t",
    "pod",
    "tcl",
    "tk",
    "exp",
    "makefile",
    "mk",
    "mak",
    "dockerfile",
    "gitignore",
    "gitattributes",
    "editorconfig",
    "env",
    "dotenv",
    "toml",
    "cfg",
    "conf",
    "ini",
    "properties",
    "awk",
    "sed",
  ],

  // Languages that use -- for comments
  DASH_COMMENT_LANGUAGES: [
    "sql",
    "mysql",
    "pgsql",
    "sqlite",
    "plsql",
    "lua",
    "moon",
    "hs",
    "lhs",
    "hsc",
    "elm",
    "vhd",
    "vhdl",
    "vho",
    "vht",
  ],

  // Languages that use ; for comments
  SEMICOLON_COMMENT_LANGUAGES: [
    "lisp",
    "lsp",
    "l",
    "cl",
    "el",
    "clj",
    "cljs",
    "cljc",
    "edn",
    "scm",
    "ss",
    "rkt",
    "sch",
    "sld",
    "asm",
    "nasm",
    "masm",
    "gas",
    "ini",
    "cfg",
    "conf",
  ],

  // Languages that use % for comments
  PERCENT_COMMENT_LANGUAGES: [
    "tex",
    "latex",
    "bib",
    "cls",
    "sty",
    "dtx",
    "matlab",
    "m",
    "fig",
    "mat",
    "slx",
    "mdl",
    "erl",
    "hrl",
    "beam",
    "app",
    "src",
    "escript",
    "prolog",
    "pro",
    "pl",
  ],

  // Markup and template languages
  MARKUP_LANGUAGES: [
    "html",
    "htm",
    "xhtml",
    "xml",
    "xsl",
    "xslt",
    "xsd",
    "dtd",
    "svg",
    "mathml",
    "md",
    "mdx",
    "markdown",
    "mdown",
    "mkd",
    "mkdn",
    "pug",
    "jade",
    "hbs",
    "handlebars",
    "mustache",
    "twig",
    "erb",
    "haml",
    "slim",
    "vue",
    "svelte",
  ],

  // Python-like languages for multiline comments
  PYTHON_LIKE: ["py", "pyx", "pyi", "pyw", "pyz", "pth"],

  // Notebooks and interactive documents
  NOTEBOOKS: [
    "ipynb",
    "rmd",
    "Rmd",
    "qmd",
    "org",
    "jl",
    "nb",
    "mathematica",
    "wl",
    "wls",
    "wxm",
  ],

  // Functional languages with special comment styles
  FUNCTIONAL_LANGUAGES: [
    "hs",
    "lhs",
    "hsc",
    "elm",
    "ml",
    "mli",
    "mll",
    "mly",
    "fs",
    "fsx",
    "fsi",
    "clj",
    "cljs",
    "cljc",
    "edn",
    "ex",
    "exs",
    "erl",
    "hrl",
  ],

  // Assembly languages
  ASSEMBLY_LANGUAGES: [
    "asm",
    "s",
    "S",
    "nasm",
    "yasm",
    "masm",
    "gas",
    "att",
    "intel",
  ],

  // Scripts and batch files
  SCRIPT_LANGUAGES: [
    "sh",
    "bash",
    "zsh",
    "fish",
    "csh",
    "tcsh",
    "ksh",
    "ash",
    "dash",
    "ps1",
    "psm1",
    "psd1",
    "ps1xml",
    "psc1",
    "bat",
    "cmd",
    "btm",
    "nt",
  ],
};

export const SEARCH_LIMITS = {
  MAX_FILES_TO_SEARCH: 50,
  MAX_RESULTS_PER_SEARCH: 50,
  MAX_CONFIG_FILES_TO_SEARCH: 15,
  MAX_CONFIG_CONTENT_RESULTS: 25,
  MAX_DOC_CONTENT_RESULTS: 25,
};

export function generateExcludePattern(
  excludedFolders: string[],
  excludedGlobPatterns: string[] = []
): string {
  const folders =
    excludedFolders && excludedFolders.length > 0
      ? excludedFolders
      : DEFAULT_EXCLUDED_FOLDERS;

  const folderPattern = `**/{${folders.join(",")}}/**`;

  if (!excludedGlobPatterns || excludedGlobPatterns.length === 0) {
    return folderPattern;
  }

  const allPatterns = [folderPattern, ...excludedGlobPatterns];
  return `{${allPatterns.join(",")}}`;
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
