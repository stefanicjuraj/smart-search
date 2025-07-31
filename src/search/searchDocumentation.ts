import * as vscode from "vscode";
import { generateExcludePattern } from "../utils/getCommentFormats";

export async function searchDocumentation(
  query: string,
  excludedFolders: string[] = ["node_modules"]
): Promise<any[]> {
  try {
    const excludePattern = generateExcludePattern(excludedFolders);
    const docFiles = await vscode.workspace.findFiles(
      `**/*${query}*.{md,mdx,rst,txt,markdown,mdown,markdn,textile,rdoc,org,creole,wiki,dokuwiki,mediawiki,pod,adoc,asciidoc,asc}`,
      excludePattern
    );

    const fileResults = docFiles
      .slice(0, 50)
      .map((uri) => {
        const fileName = uri.path.split("/").pop() || "";
        return {
          type: "doc",
          name: fileName,
          path: vscode.workspace.asRelativePath(uri),
          uri: uri.toString(),
          isFile: true,
        };
      })
      .filter((item) => item.name && item.name.trim().length > 0);

    const docPattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] || "",
      "**/*.{md,mdx,rst,txt,markdown,mdown,markdn,textile,rdoc,org,creole,wiki,dokuwiki,mediawiki,pod,adoc,asciidoc,asc}"
    );

    const allDocFiles = await vscode.workspace.findFiles(
      docPattern,
      excludePattern
    );
    const filesToSearch = allDocFiles.slice(0, 50);
    const contentResults: any[] = [];

    for (const file of filesToSearch) {
      try {
        const document = await vscode.workspace.openTextDocument(file);
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        const fileName = file.path.split("/").pop() || "";

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query.toLowerCase())) {
            const lineText = lines[i].trim();
            if (lineText && lineText.length > 0) {
              const meaningfulContent = lineText
                .replace(new RegExp(query, "gi"), "")
                .trim();

              const hasSubstantialContent =
                lineText.length > query.length + 5 ||
                meaningfulContent.length > 0;

              if (hasSubstantialContent) {
                contentResults.push({
                  type: "doc",
                  name: lineText,
                  path: vscode.workspace.asRelativePath(file),
                  uri: file.toString(),
                  lineNumber: i,
                  fileName: fileName,
                });
              }
            }

            if (contentResults.length >= 25) {
              break;
            }
          }
        }
      } catch (err) {
        continue;
      }
    }

    return [...fileResults, ...contentResults].slice(0, 50);
  } catch (error) {
    console.error("Documentation search error:", error);
    return [];
  }
}
