import * as vscode from "vscode";

export async function searchText(query: string): Promise<any[]> {
  if (!query || query.length < 2) {
    return [];
  }

  try {
    const textResults: any[] = [];

    const filePattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      "**/*.{js,ts,jsx,tsx,html,css,md,json,py,java,c,cpp,h,hpp,ipynb}"
    );

    const files = await vscode.workspace.findFiles(
      filePattern,
      "**/node_modules/**"
    );
    const filesToSearch = files.slice(0, 50);

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();

        const fileExt = file.path.split(".").pop()?.toLowerCase();
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

        const fileName = file.path.split("/").pop() || "";

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
              const meaningfulContent = lineText
                .replace(new RegExp(query, "gi"), "")
                .trim();

              const hasSubstantialContent =
                lineText.length > query.length + 5 ||
                meaningfulContent.length > 0;

              if (hasSubstantialContent) {
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

            if (textResults.length >= 50) {
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
