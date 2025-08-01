import * as vscode from "vscode";
import {
  generateExcludePattern,
  DEFAULT_EXCLUDED_FOLDERS,
  FILE_PATTERNS,
  SEARCH_LIMITS,
  FILE_EXTENSIONS,
  getCommentFormats,
  truncateText,
  getFileName,
  getFileExtension,
} from "../utils/getCommentFormats";

export async function searchComments(
  query: string,
  excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS
): Promise<any[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const commentResults: any[] = [];
    const processedLines = new Set<string>();

    const codePattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      FILE_PATTERNS.CODE_FILES
    );

    const excludePattern = generateExcludePattern(excludedFolders);
    const files = await vscode.workspace.findFiles(codePattern, excludePattern);

    const filesToSearch = files
      .filter((file) => {
        const fileName = file.path.toLowerCase();
        const queryLower = query.toLowerCase();

        const baseName = fileName.substring(fileName.lastIndexOf("/") + 1);
        if (baseName.includes(queryLower)) {
          return false;
        }

        return true;
      })
      .slice(0, SEARCH_LIMITS.MAX_FILES_TO_SEARCH);

    const commentPatterns = getCommentFormats();

    const excludePatterns = [
      /\*\*\/\*.*\*\.\{.*\}/,
      /\*\*\/node_modules\/\*\*/,
      /\*\.\{.*\}/,
      /\$\{.*\}/,
      /findFiles/,
      /vscode\.workspace/,
      /RelativePattern/,
      /workspaceFolders/,
      /await.*\(/,
      /const.*=/,
      /let.*=/,
      /var.*=/,
      /function.*\(/,
      /\/\//,
      /['"`].*node_modules.*['"`]/,
      /['"`].*\*\*\/.*['"`]/,
      /['"`].*\.\{.*\}.*['"`]/,
      /new [A-Za-z]+\(/,
      /^\s*import\s+/,
      /^\s*export\s+/,
      /^\s*const\s+/,
      /^\s*let\s+/,
      /^\s*var\s+/,
      /^\s*function\s+/,
      /^\s*class\s+/,
      /^\s*interface\s+/,
      /^\s*type\s+/,
      /^\s*enum\s+/,
      /^\s*namespace\s+/,
      /^\s*module\s+/,
      /^\s*return\s+/,
      /^\s*if\s*\(/,
      /^\s*for\s*\(/,
      /^\s*while\s*\(/,
      /^\s*switch\s*\(/,
      /^\s*case\s+/,
    ];

    function isComment(text: string): boolean {
      if (text.includes("**/node_modules/**")) {
        return false;
      }

      if (
        text.includes("findFiles") ||
        text.includes("vscode.workspace") ||
        text.includes("workspaceFolders")
      ) {
        return false;
      }

      if (/\s*=\s*['"`].*['"`]\s*;?\s*$/.test(text)) {
        return false;
      }

      if (/await.*\(.*\)/.test(text) || /\.then\(.*\)/.test(text)) {
        return false;
      }

      for (const pattern of excludePatterns) {
        if (pattern.test(text)) {
          return false;
        }
      }

      const stripped = text.trim().replace(/^["'`](.*)["'`]$/, "$1");

      for (const pattern of excludePatterns) {
        if (pattern.test(stripped)) {
          return false;
        }
      }

      const quotedContent = text.match(/["'`](.*?)["'`]/g);
      if (quotedContent) {
        for (const quoted of quotedContent) {
          const content = quoted.substring(1, quoted.length - 1);
          if (
            content.includes("node_modules") ||
            content.includes("*.{") ||
            content.includes("**/")
          ) {
            return false;
          }
        }
      }

      return true;
    }

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const fileExt = getFileExtension(file.path);
        const isMarkdown = FILE_EXTENSIONS.MARKUP_LANGUAGES.includes(fileExt);

        const multilineComments: { text: string; lineNumber: number }[] = [];

        if (FILE_EXTENSIONS.C_STYLE_LANGUAGES.includes(fileExt)) {
          const cStyleRegex = commentPatterns.multiLine.cStyle;
          let match;
          while ((match = cStyleRegex.exec(text)) !== null) {
            const comment = match[0];
            const lineNumber =
              text.substring(0, match.index).split("\n").length - 1;
            const cleanedComment = comment
              .replace(/^\/\*+/, "")
              .replace(/\*+\/$/, "")
              .trim();

            if (cleanedComment.length > 0 && isComment(cleanedComment)) {
              multilineComments.push({ text: cleanedComment, lineNumber });
            }
          }
        }

        if (FILE_EXTENSIONS.PYTHON_LIKE.includes(fileExt)) {
          const pythonRegex = commentPatterns.multiLine.python;
          let match;
          while ((match = pythonRegex.exec(text)) !== null) {
            const comment = match[0];
            const quoteType = comment.startsWith('"""') ? '"""' : "'''";
            const lineNumber =
              text.substring(0, match.index).split("\n").length - 1;
            const cleanedComment = comment
              .substring(quoteType.length, comment.length - quoteType.length)
              .trim();

            if (cleanedComment.length > 0 && isComment(cleanedComment)) {
              multilineComments.push({ text: cleanedComment, lineNumber });
            }
          }
        }

        if (FILE_EXTENSIONS.MARKUP_LANGUAGES.includes(fileExt)) {
          const htmlRegex = commentPatterns.multiLine.html;
          let match;
          while ((match = htmlRegex.exec(text)) !== null) {
            const comment = match[0];
            const lineNumber =
              text.substring(0, match.index).split("\n").length - 1;
            const cleanedComment = comment
              .replace(/^<!--\s*/, "")
              .replace(/\s*-->$/, "")
              .trim();

            if (cleanedComment.length > 0 && isComment(cleanedComment)) {
              multilineComments.push({ text: cleanedComment, lineNumber });
            }
          }
        }

        if (FILE_EXTENSIONS.NOTEBOOKS.includes(fileExt)) {
          try {
            const notebookContent = JSON.parse(text);
            if (notebookContent.cells) {
              let lineCounter = 0;
              notebookContent.cells.forEach((cell: any) => {
                if (cell.cell_type === "markdown" && cell.source) {
                  const source = Array.isArray(cell.source)
                    ? cell.source.join("")
                    : cell.source;
                  if (source.trim().length > 0 && isComment(source)) {
                    multilineComments.push({
                      text: source,
                      lineNumber: lineCounter,
                    });
                  }
                  lineCounter += source.split(/\r?\n/).length;
                } else if (cell.cell_type === "code" && cell.source) {
                  const source = Array.isArray(cell.source)
                    ? cell.source.join("")
                    : cell.source;
                  const lines = source.split(/\r?\n/);

                  let inMultilineComment = false;
                  let quoteType = "";
                  let commentStart = 0;
                  let commentText = "";

                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (!inMultilineComment) {
                      if (line.startsWith('"""') || line.startsWith("'''")) {
                        inMultilineComment = true;
                        quoteType = line.startsWith('"""') ? '"""' : "'''";
                        commentStart = lineCounter + i;
                        commentText = line.substring(3);

                        if (line.endsWith(quoteType) && line.length > 6) {
                          inMultilineComment = false;
                          commentText = commentText
                            .substring(0, commentText.length - 3)
                            .trim();

                          if (isComment(commentText)) {
                            multilineComments.push({
                              text: commentText,
                              lineNumber: commentStart,
                            });
                          }
                          commentText = "";
                        }
                      } else if (line.startsWith("#")) {
                        const commentText = line.substring(1).trim();
                        if (isComment(commentText)) {
                          multilineComments.push({
                            text: commentText,
                            lineNumber: lineCounter + i,
                          });
                        }
                      }
                    } else {
                      if (line.endsWith(quoteType)) {
                        inMultilineComment = false;
                        commentText +=
                          "\n" +
                          line.substring(0, line.lastIndexOf(quoteType)).trim();

                        if (isComment(commentText)) {
                          multilineComments.push({
                            text: commentText,
                            lineNumber: commentStart,
                          });
                        }
                        commentText = "";
                      } else {
                        commentText += "\n" + line.trim();
                      }
                    }
                  }

                  lineCounter += lines.length;
                }
              });
            }
          } catch (e) {
            console.error("Error parsing Jupyter notebook:", e);
          }
        }

        for (const comment of multilineComments) {
          if (comment.text.toLowerCase().includes(query.toLowerCase())) {
            let displayText = comment.text;

            if (
              isMarkdown &&
              displayText.startsWith("<!--") &&
              displayText.endsWith("-->")
            ) {
              displayText = displayText
                .substring(4, displayText.length - 3)
                .trim();
            }

            if (displayText.includes("\n")) {
              displayText = displayText.split("\n")[0].trim() + "...";
            }
            if (displayText.length > 100) {
              displayText = displayText.substring(0, 100) + "...";
            }

            if (isComment(displayText)) {
              addCommentResult(
                displayText,
                file,
                comment.lineNumber,
                processedLines,
                commentResults
              );

              if (
                commentResults.length >= SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH
              ) {
                break;
              }
            }
          }
        }

        if (commentResults.length >= SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH) {
          continue;
        }

        const lines = text.split(/\r?\n/);
        const multilineLineNumbers = new Set(
          multilineComments.map((c) => c.lineNumber)
        );

        for (let i = 0; i < lines.length; i++) {
          if (multilineLineNumbers.has(i)) {
            continue;
          }

          const line = lines[i].trim();
          if (!line) {
            continue;
          }

          let commentText = "";

          if (FILE_EXTENSIONS.C_STYLE_LANGUAGES.includes(fileExt)) {
            const match = line.match(commentPatterns.singleLine["//"]);
            if (match && match[1]) {
              commentText = match[1].trim();
            }
          }

          if (
            FILE_EXTENSIONS.HASH_COMMENT_LANGUAGES.includes(fileExt) &&
            !commentText
          ) {
            const match = line.match(commentPatterns.singleLine["#"]);
            if (match && match[1]) {
              commentText = match[1].trim();
            }
          }

          if (
            FILE_EXTENSIONS.DASH_COMMENT_LANGUAGES.includes(fileExt) &&
            !commentText
          ) {
            const match = line.match(commentPatterns.singleLine["--"]);
            if (match && match[1]) {
              commentText = match[1].trim();
            }
          }

          if (
            FILE_EXTENSIONS.SEMICOLON_COMMENT_LANGUAGES.includes(fileExt) &&
            !commentText
          ) {
            const match = line.match(commentPatterns.singleLine[";"]);
            if (match && match[1]) {
              commentText = match[1].trim();
            }
          }

          if (!commentText) {
            if (line.startsWith("//")) {
              commentText = line.substring(2).trim();
            } else if (line.startsWith("#")) {
              commentText = line.substring(1).trim();
            } else if (line.startsWith("--")) {
              commentText = line.substring(2).trim();
            } else if (line.startsWith(";")) {
              commentText = line.substring(1).trim();
            } else if (
              line.startsWith("/*") &&
              line.endsWith("*/") &&
              line.length > 4
            ) {
              commentText = line.substring(2, line.length - 2).trim();
            } else if (
              line.startsWith("<!--") &&
              line.endsWith("-->") &&
              line.length > 7
            ) {
              commentText = line.substring(4, line.length - 3).trim();
            }
          }

          if (
            commentText &&
            commentText.toLowerCase().includes(query.toLowerCase()) &&
            isComment(commentText)
          ) {
            addCommentResult(
              commentText,
              file,
              i,
              processedLines,
              commentResults
            );

            if (commentResults.length >= SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH) {
              break;
            }
          }
        }
      } catch (err) {
        continue;
      }

      if (commentResults.length >= SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH) {
        break;
      }
    }

    return commentResults;
  } catch (error) {
    console.error("Comment search error:", error);
    return [];
  }
}

function addCommentResult(
  commentText: string,
  file: vscode.Uri,
  lineNumber: number,
  processedLines: Set<string>,
  commentResults: any[]
): void {
  commentText = commentText.trim();
  commentText = truncateText(commentText, 100);

  const uniqueKey = `${file.toString()}:${lineNumber}:${commentText}`;
  if (!processedLines.has(uniqueKey)) {
    processedLines.add(uniqueKey);
    commentResults.push({
      type: "comment",
      name: commentText,
      path: vscode.workspace.asRelativePath(file),
      uri: file.toString(),
      lineNumber: lineNumber,
    });
  }
}

function extractMultilineComments(
  text: string,
  fileExt: string
): { text: string; lineNumber: number }[] {
  const comments: { text: string; lineNumber: number }[] = [];

  if (fileExt === "ipynb") {
    try {
      const notebookContent = JSON.parse(text);
      if (notebookContent.cells) {
        let lineCounter = 0;

        notebookContent.cells.forEach((cell: any) => {
          if (cell.cell_type === "markdown" && cell.source) {
            const source = Array.isArray(cell.source)
              ? cell.source.join("")
              : cell.source;

            if (source.trim().length > 0) {
              comments.push({
                text: source,
                lineNumber: lineCounter,
              });
            }
            lineCounter += source.split(/\r?\n/).length;
          } else if (cell.cell_type === "code" && cell.source) {
            const source = Array.isArray(cell.source)
              ? cell.source.join("")
              : cell.source;

            const lines = source.split(/\r?\n/);

            let inMultilineComment = false;
            let quoteType = "";
            let commentStart = 0;
            let commentText = "";

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];

              if (!inMultilineComment) {
                if (
                  line.trim().startsWith('"""') ||
                  line.trim().startsWith("'''")
                ) {
                  inMultilineComment = true;
                  quoteType = line.trim().startsWith('"""') ? '"""' : "'''";
                  commentStart = lineCounter + i;
                  commentText = line.trim().substring(3);

                  if (
                    line.trim().endsWith(quoteType) &&
                    line.trim().length > 6
                  ) {
                    inMultilineComment = false;
                    commentText = commentText
                      .substring(0, commentText.length - 3)
                      .trim();
                    comments.push({
                      text: commentText,
                      lineNumber: commentStart,
                    });
                    commentText = "";
                  }
                }
              } else {
                if (line.trim().endsWith(quoteType)) {
                  inMultilineComment = false;
                  commentText +=
                    "\n" +
                    line.substring(0, line.lastIndexOf(quoteType)).trim();
                  comments.push({
                    text: commentText,
                    lineNumber: commentStart,
                  });
                  commentText = "";
                } else {
                  commentText += "\n" + line.trim();
                }
              }
            }

            lineCounter += lines.length;
          }
        });
      }
    } catch (e) {
      console.error("Error parsing Jupyter notebook:", e);
    }
  }

  if (
    [
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
    ].includes(fileExt)
  ) {
    const regex = /\/\*[\s\S]*?\*\//g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const comment = match[0];
      const cleanedComment = comment
        .replace(/^\/\*+/, "")
        .replace(/\*+\/$/, "")
        .trim();

      const lineNumber = text.substring(0, match.index).split("\n").length - 1;

      if (cleanedComment.length > 0) {
        comments.push({ text: cleanedComment, lineNumber });
      }
    }
  } else if (fileExt === "py") {
    const regexes = [/'''[\s\S]*?'''/g, /"""[\s\S]*?"""/g];
    for (const regex of regexes) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const comment = match[0];
        const quoteType = comment.startsWith('"""') ? '"""' : "'''";
        const cleanedComment = comment
          .substring(quoteType.length, comment.length - quoteType.length)
          .trim();

        const lineNumber =
          text.substring(0, match.index).split("\n").length - 1;

        if (cleanedComment.length > 0) {
          comments.push({ text: cleanedComment, lineNumber });
        }
      }
    }
  } else if (
    ["html", "xml", "svg", "md", "mdx", "markdown"].includes(fileExt)
  ) {
    const regex = /<!--[\s\S]*?-->/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const comment = match[0];
      const cleanedComment = comment
        .replace(/^<!--\s*/, "")
        .replace(/\s*-->$/, "")
        .trim();

      const lineNumber = text.substring(0, match.index).split("\n").length - 1;

      if (cleanedComment.length > 0) {
        comments.push({ text: cleanedComment, lineNumber });
      }
    }
  }

  return comments;
}
