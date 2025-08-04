import * as vscode from "vscode";
import {
  generateExcludePattern,
  DEFAULT_EXCLUDED_FOLDERS,
  FILE_PATTERNS,
  SEARCH_LIMITS,
  getFileName,
} from "../utils/getCommentFormats";

export async function searchFiles(
  query: string,
  excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS,
  excludedGlobPatterns: string[] = []
): Promise<any[]> {
  try {
    const excludePattern = generateExcludePattern(
      excludedFolders,
      excludedGlobPatterns
    );
    const files = await vscode.workspace.findFiles(
      FILE_PATTERNS.ALL_FILES.replace("**/*.", `**/*${query}*.`),
      excludePattern
    );

    if (query && query.length >= 2) {
      try {
        const notebookFiles = await vscode.workspace.findFiles(
          FILE_PATTERNS.NOTEBOOKS,
          excludePattern
        );

        for (const file of notebookFiles) {
          if (files.some((f) => f.fsPath === file.fsPath)) {
            continue;
          }

          try {
            const document = await vscode.workspace.openTextDocument(file);
            const content = document.getText();

            if (content.toLowerCase().includes(query.toLowerCase())) {
              files.push(file);
            }
          } catch (err) {
            console.error(`Error checking notebook content: ${file.path}`, err);
          }
        }
      } catch (err) {
        console.error("Error finding notebook files:", err);
      }
    }

    return files
      .slice(0, SEARCH_LIMITS.MAX_FILES_TO_SEARCH)
      .map((uri) => {
        const fileName = getFileName(uri.path);
        return {
          type: "file",
          name: fileName,
          path: vscode.workspace.asRelativePath(uri),
          uri: uri.toString(),
        };
      })
      .filter((item) => item.name && item.name.trim().length > 0);
  } catch (error) {
    console.error("File search error:", error);
    return [];
  }
}
