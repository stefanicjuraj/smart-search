import * as vscode from "vscode";
import {
  generateExcludePattern,
  DEFAULT_EXCLUDED_FOLDERS,
  FILE_PATTERNS,
  SEARCH_LIMITS,
  hasSubstantialContent,
  getFileName,
} from "../utils/getCommentFormats";

export async function searchConfigurations(
  query: string,
  excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS,
  excludedGlobPatterns: string[] = []
): Promise<any[]> {
  try {
    const excludePattern = generateExcludePattern(
      excludedFolders,
      excludedGlobPatterns
    );
    const configFiles = await vscode.workspace.findFiles(
      FILE_PATTERNS.CONFIGURATION.replace("**/*.", `**/*${query}*.`),
      excludePattern
    );

    const fileResults = configFiles
      .slice(0, SEARCH_LIMITS.MAX_FILES_TO_SEARCH)
      .map((uri) => {
        const fileName = getFileName(uri.path);
        return {
          type: "config",
          name: fileName,
          path: vscode.workspace.asRelativePath(uri),
          uri: uri.toString(),
          isFile: true,
        };
      })
      .filter((item) => item.name && item.name.trim().length > 0);

    const configPattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      FILE_PATTERNS.CONFIGURATION
    );

    const allConfigFiles = await vscode.workspace.findFiles(
      configPattern,
      excludePattern
    );
    const filesToSearch = allConfigFiles.slice(
      0,
      SEARCH_LIMITS.MAX_CONFIG_FILES_TO_SEARCH
    );
    const contentResults: any[] = [];

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const fileName = getFileName(file.path);

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query.toLowerCase())) {
            const lineText = lines[i].trim();
            if (lineText && lineText.length > 0) {
              if (hasSubstantialContent(lineText, query)) {
                contentResults.push({
                  type: "config",
                  name: lineText,
                  path: vscode.workspace.asRelativePath(file),
                  uri: file.toString(),
                  lineNumber: i,
                  fileName: fileName,
                });
              }
            }

            if (
              contentResults.length >= SEARCH_LIMITS.MAX_CONFIG_CONTENT_RESULTS
            ) {
              break;
            }
          }
        }
      } catch (err) {
        continue;
      }
    }

    return [...fileResults, ...contentResults].slice(
      0,
      SEARCH_LIMITS.MAX_RESULTS_PER_SEARCH
    );
  } catch (error) {
    console.error("Config search error:", error);
    return [];
  }
}
