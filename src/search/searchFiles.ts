import * as vscode from "vscode";
import { generateExcludePattern } from "../utils/getCommentFormats";

export async function searchFiles(
  query: string,
  excludedFolders: string[] = ["node_modules"]
): Promise<any[]> {
  try {
    const excludePattern = generateExcludePattern(excludedFolders);
    const files = await vscode.workspace.findFiles(
      `**/*${query}*.{js,ts,jsx,tsx,html,css,md,json,py,java,c,cpp,h,hpp,ipynb}`,
      excludePattern
    );

    if (query && query.length >= 2) {
      try {
        const notebookFiles = await vscode.workspace.findFiles(
          "**/*.ipynb",
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
      .slice(0, 50)
      .map((uri) => {
        const fileName = uri.path.split("/").pop() || "";
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
