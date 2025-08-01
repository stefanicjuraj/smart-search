import * as vscode from "vscode";
import { 
  generateExcludePattern, 
  DEFAULT_EXCLUDED_FOLDERS,
  FILE_PATTERNS,
  SEARCH_LIMITS,
  hasSubstantialContent,
  getFileName,
  getFileExtension
} from "../utils/getCommentFormats";

export async function searchText(
  query: string,
  excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS
): Promise<any[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const textResults: any[] = [];

    const filePattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      FILE_PATTERNS.ALL_FILES
    );

    const excludePattern = generateExcludePattern(excludedFolders);
    const files = await vscode.workspace.findFiles(filePattern, excludePattern);
    const filesToSearch = files.slice(0, SEARCH_LIMITS.MAX_FILES_TO_SEARCH);

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();

        const fileExt = getFileExtension(file.path);
        let lines: string[] = [];
        let lineMap: { originalLine: number; content: string }[] = [];

        if (fileExt === "ipynb") {
          try {
            const notebookContent = JSON.parse(text);

            if (notebookContent.cells && Array.isArray(notebookContent.cells)) {
              console.log(
                `Found ${notebookContent.cells.length} cells in notebook`
              );

              notebookContent.cells.forEach((cell: any, cellIndex: number) => {
                if (cell && cell.source) {
                  console.log(
                    `Cell ${cellIndex} type: ${
                      cell.cell_type
                    }, source type: ${typeof cell.source}`
                  );

                  let sourceLines: string[] = [];

                  if (Array.isArray(cell.source)) {
                    sourceLines = cell.source;
                    console.log(
                      `Cell ${cellIndex} has array source with ${sourceLines.length} lines`
                    );
                  } else if (typeof cell.source === "string") {
                    sourceLines = cell.source.split("\n");
                    console.log(
                      `Cell ${cellIndex} has string source with ${sourceLines.length} lines`
                    );
                  }

                  sourceLines.forEach((line: string) => {
                    const cleanLine = line
                      .replace(/\\n/g, "")
                      .replace(/\\"/g, '"');

                    if (cleanLine) {
                      lines.push(cleanLine);
                      lineMap.push({
                        originalLine: lines.length - 1,
                        content: cleanLine,
                      });

                      if (
                        query &&
                        cleanLine.toLowerCase().includes(query.toLowerCase())
                      ) {
                        console.log(
                          `Found match for "${query}" in line: ${cleanLine}`
                        );
                      }
                    }
                  });
                }
              });

              if (lines.length > 0) {
                console.log(
                  `Extracted ${lines.length} searchable lines from notebook`
                );
              } else {
                console.warn("No content was extracted from the notebook");
              }
            } else {
              console.warn("Notebook has no cells array or it is not an array");
            }
          } catch (e) {
            console.error("Error parsing ipynb:", e);
            lines = text.split(/\r?\n/);
            lines.forEach((line, i) => {
              if (line.trim()) {
                lineMap.push({
                  originalLine: i,
                  content: line,
                });
              }
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

        const fileName = getFileName(file.path);

        if (fileExt === "ipynb" && query) {
          if (text.toLowerCase().includes(query.toLowerCase())) {
            console.log(`Found direct match in notebook for "${query}"`);

            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            const index = lowerText.indexOf(lowerQuery);

            if (index !== -1) {
              const start = Math.max(0, index - 20);
              const end = Math.min(text.length, index + query.length + 20);
              let context = text.substring(start, end);

              context = context
                .replace(/[{},\[\]"\\]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

              textResults.push({
                type: "text",
                name: context,
                path: vscode.workspace.asRelativePath(file),
                uri: file.toString(),
                lineNumber: 0,
                fileName: fileName,
              });
            }
          }
        }

        for (let i = 0; i < lines.length; i++) {
          const currentLine = lineMap[i]?.content || lines[i];
          const originalLineNumber = lineMap[i]?.originalLine || i;

          if (currentLine.toLowerCase().includes(query.toLowerCase())) {
            const lineText = currentLine.trim();
            if (lineText && lineText.length > 0) {
              if (hasSubstantialContent(lineText, query)) {
                textResults.push({
                  type: "text",
                  name: lineText,
                  path: vscode.workspace.asRelativePath(file),
                  uri: file.toString(),
                  lineNumber: originalLineNumber,
                  fileName: fileName,
                });
              } else {
                if (fileExt === "ipynb") {
                  textResults.push({
                    type: "text",
                    name: lineText,
                    path: vscode.workspace.asRelativePath(file),
                    uri: file.toString(),
                    lineNumber: originalLineNumber,
                    fileName: fileName,
                  });
                }
              }
            }

            if (textResults.length >= SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH) {
              break;
            }
          }
        }
      } catch (err) {
        console.error(`Error processing file ${file.path}:`, err);
        continue;
      }
    }

    return textResults;
  } catch (error) {
    console.error("Text search error:", error);
    return [];
  }
}
