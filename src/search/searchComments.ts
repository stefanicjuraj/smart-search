import * as vscode from "vscode";

export async function searchComments(query: string): Promise<any[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const commentResults: any[] = [];
    const processedLines = new Set<string>();

    const codePattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      "**/*.{js,ts,jsx,tsx,java,c,cpp,cs,go,php,py,rb,rs,swift,kt,scala,h,hpp,m,mm,jade,pug,vue,svelte,html,css,scss,less,dart,lua,md,mdx,markdown,ipynb}"
    );

    const files = await vscode.workspace.findFiles(
      codePattern,
      "**/node_modules/**"
    );

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
      .slice(0, 25);

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const fileExt = file.path.split(".").pop()?.toLowerCase() || "";
        const isMarkdown = ["md", "mdx", "markdown"].includes(fileExt);

        let lines: string[] = [];
        let lineMap: { originalLine: number; content: string }[] = [];

        if (fileExt === "ipynb") {
          try {
            const notebookContent = JSON.parse(text);

            if (notebookContent.cells) {
              let lineCounter = 0;

              notebookContent.cells.forEach((cell: any, cellIndex: number) => {
                if (cell.source) {
                  const sourceArray = Array.isArray(cell.source)
                    ? cell.source
                    : cell.source.split(/\r?\n/);

                  sourceArray.forEach((line: string, i: number) => {
                    const cleanLine = line.replace(/\\n$/, "");

                    if (cell.cell_type === "code") {
                      if (cleanLine.trim().startsWith("#")) {
                        lines.push(cleanLine);
                        lineMap.push({
                          originalLine: lineCounter + i,
                          content: cleanLine,
                        });
                      }
                    } else if (cell.cell_type === "markdown") {
                      if (cleanLine.length > 0) {
                        lines.push(cleanLine);
                        lineMap.push({
                          originalLine: lineCounter + i,
                          content: cleanLine,
                        });
                      }
                    }
                  });

                  lineCounter += sourceArray.length;
                }
              });
            }
          } catch (e) {
            console.error("Error parsing ipynb for comments:", e);
            lines = text.split(/\r?\n/);
            lines.forEach((line, i) => {
              lineMap.push({
                originalLine: i,
                content: line,
              });
            });
          }
        } else {
          lines = text.split(/\r?\n/);
          lines.forEach((line, i) => {
            lineMap.push({
              originalLine: i,
              content: line,
            });
          });
        }

        const multilineComments = extractMultilineComments(text, fileExt);
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
              if (displayText.includes("\n")) {
                displayText = displayText.split("\n")[0].trim() + "...";
              }
            } else if (comment.text.includes("\n")) {
              displayText = comment.text.split("\n")[0].trim() + "...";
            }

            const uniqueKey = `${file.toString()}:${
              comment.lineNumber
            }:${displayText}`;
            if (!processedLines.has(uniqueKey)) {
              processedLines.add(uniqueKey);
              commentResults.push({
                type: "comment",
                name: displayText,
                path: vscode.workspace.asRelativePath(file),
                uri: file.toString(),
                lineNumber: comment.lineNumber,
              });

              if (commentResults.length >= 50) {
                break;
              }
            }
          }
        }

        const multilineLineNumbers = new Set(
          multilineComments.map((c: { lineNumber: any }) => c.lineNumber)
        );

        for (let i = 0; i < lines.length; i++) {
          const currentLine =
            fileExt === "ipynb" ? lineMap[i].content : lines[i];
          const originalLineNumber =
            fileExt === "ipynb" ? lineMap[i].originalLine : i;

          if (multilineLineNumbers.has(originalLineNumber)) {
            continue;
          }

          const line = currentLine.trim();
          if (!line) continue;

          let isComment = false;
          let commentStart = -1;

          if (line.startsWith("//")) {
            isComment = true;
            commentStart = 2;
          } else if (line.startsWith("#")) {
            isComment = true;
            commentStart = 1;
          } else if (line.startsWith("<!--")) {
            isComment = true;
            commentStart = 4;
          } else if (line.startsWith("--")) {
            isComment = true;
            commentStart = 2;
          } else if (line.startsWith(";")) {
            isComment = true;
            commentStart = 1;
          } else if (line.startsWith("/*") && line.endsWith("*/")) {
            isComment = true;
            commentStart = 2;
            const endMarker = line.lastIndexOf("*/");
            if (endMarker > 2) {
              const commentText = line
                .substring(commentStart, endMarker)
                .trim();

              if (commentText.toLowerCase().includes(query.toLowerCase())) {
                const uniqueKey = `${file.toString()}:${originalLineNumber}:${commentText}`;
                if (!processedLines.has(uniqueKey)) {
                  processedLines.add(uniqueKey);
                  commentResults.push({
                    type: "comment",
                    name: commentText,
                    path: vscode.workspace.asRelativePath(file),
                    uri: file.toString(),
                    lineNumber: originalLineNumber,
                  });

                  if (commentResults.length >= 50) {
                    break;
                  }
                }
              }
              continue;
            }
          } else if (line.startsWith("*") && !line.startsWith("*/")) {
            if (
              i > 0 &&
              (lines[i - 1].trim().startsWith("/*") ||
                lines[i - 1].trim().startsWith("*"))
            ) {
              isComment = true;
              commentStart = 1;
            }
          }

          if (isComment && commentStart >= 0) {
            let commentText = line.substring(commentStart).trim();

            if (commentText.toLowerCase().includes(query.toLowerCase())) {
              const uniqueKey = `${file.toString()}:${originalLineNumber}:${commentText}`;
              if (!processedLines.has(uniqueKey)) {
                processedLines.add(uniqueKey);
                commentResults.push({
                  type: "comment",
                  name: commentText,
                  path: vscode.workspace.asRelativePath(file),
                  uri: file.toString(),
                  lineNumber: originalLineNumber,
                });

                if (commentResults.length >= 50) {
                  break;
                }
              }
            }
          }
        }
      } catch (err) {
        continue;
      }
    }

    return commentResults;
  } catch (error) {
    console.error("Comment search error:", error);
    return [];
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
