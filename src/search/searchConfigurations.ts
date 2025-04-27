import * as vscode from "vscode";

export async function searchConfigurations(query: string): Promise<any[]> {
  try {
    const configFiles = await vscode.workspace.findFiles(
      `**/*${query}*.{json,yaml,yml,ini,toml,xml,conf,config,env,properties,props,plist,cfg,rc}`,
      "**/node_modules/**"
    );

    const fileResults = configFiles
      .slice(0, 25)
      .map((uri) => {
        const fileName = uri.path.split("/").pop() || "";
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
      "**/*.{json,yaml,yml,ini,toml,xml,conf,config,env,properties,props,plist,cfg,rc}"
    );

    const allConfigFiles = await vscode.workspace.findFiles(
      configPattern,
      "**/node_modules/**"
    );
    const filesToSearch = allConfigFiles.slice(0, 15);
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
                  type: "config",
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
    console.error("Config search error:", error);
    return [];
  }
}
