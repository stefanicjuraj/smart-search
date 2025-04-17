import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "smart-search" is now active');

  const disposable = vscode.commands.registerCommand(
    "smart-search.openSearchPopup",
    () => {
      SearchPanel.createOrShow(context.extensionUri);
    }
  );

  context.subscriptions.push(disposable);
}

class SearchPanel {
  public static currentPanel: SearchPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SearchPanel.currentPanel) {
      SearchPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "smart-search",
      "Smart Search",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    SearchPanel.currentPanel = new SearchPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "search":
            this.performSearch(message.text, message.category);
            return;
          case "selectResult":
            this.handleResultSelection(message.item);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  private async performSearch(query: string, category: string) {
    if (!query || query.trim().length === 0) {
      this._panel.webview.postMessage({
        command: "searchResults",
        results: [],
      });
      return;
    }

    try {
      let results: any[] = [];

      const fileResults = await this.searchFiles(query);
      const textResults = await this.searchText(query);
      const symbolResults = await this.searchSymbols(query);
      const docResults = await this.searchDocumentation(query);
      const configResults = await this.searchConfigFiles(query);
      const commentResults = await this.searchComments(query);

      switch (category) {
        case "all":
          results = [
            ...fileResults,
            ...textResults,
            ...symbolResults,
            ...docResults,
            ...configResults,
            ...commentResults,
          ];
          break;
        case "files":
          results = fileResults;
          break;
        case "text":
          results = textResults;
          break;
        case "symbols":
          results = symbolResults;
          break;
        case "docs":
          results = docResults;
          break;
        case "config":
          results = configResults;
          break;
        case "comments":
          results = commentResults;
          break;
        default:
          results = [
            ...fileResults,
            ...textResults,
            ...symbolResults,
            ...docResults,
            ...configResults,
            ...commentResults,
          ];
      }

      results = results.filter((item) => {
        if (
          !item ||
          !item.name ||
          typeof item.name !== "string" ||
          item.name.trim().length === 0
        ) {
          return false;
        }

        if (
          item.type === "text" ||
          item.type === "doc" ||
          item.type === "config"
        ) {
          const contentWithoutQuery = item.name
            .replace(new RegExp(query, "gi"), "")
            .trim();
          return (
            item.name.length > query.length + 3 ||
            contentWithoutQuery.length > 0
          );
        }

        return true;
      });

      this._panel.webview.postMessage({ command: "searchResults", results });
    } catch (error) {
      console.error("Search error:", error);
      vscode.window.showErrorMessage(`Search error: ${error}`);
    }
  }

  private async searchFiles(query: string): Promise<any[]> {
    try {
      const files = await vscode.workspace.findFiles(
        `**/*${query}*.*`,
        "**/node_modules/**"
      );

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

  private async searchText(query: string): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const textResults: any[] = [];

      const filePattern = new vscode.RelativePattern(
        vscode.workspace.workspaceFolders?.[0] || "",
        "**/*.{js,ts,jsx,tsx,html,css,md,json,py,java,c,cpp,h,hpp}"
      );

      const files = await vscode.workspace.findFiles(
        filePattern,
        "**/node_modules/**"
      );
      const filesToSearch = files.slice(0, 20);

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
                  textResults.push({
                    type: "text",
                    name: lineText,
                    path: vscode.workspace.asRelativePath(file),
                    uri: file.toString(),
                    lineNumber: i,
                    fileName: fileName,
                  });
                }
              }

              if (textResults.length >= 50) {
                break;
              }
            }
          }
        } catch (err) {
          continue;
        }
      }

      return textResults;
    } catch (error) {
      console.error("Text search error:", error);
      return [];
    }
  }

  private async searchSymbols(query: string): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const symbols = await vscode.commands.executeCommand<
        vscode.SymbolInformation[]
      >("vscode.executeWorkspaceSymbolProvider", query);

      return symbols.slice(0, 50).map((symbol) => ({
        type: "symbol",
        name: symbol.name,
        path: vscode.workspace.asRelativePath(symbol.location.uri),
        uri: symbol.location.uri.toString(),
        lineNumber: symbol.location.range.start.line,
        kind: symbol.kind,
        kindName: this.getSymbolKindName(symbol.kind),
      }));
    } catch (error) {
      console.error("Symbol search error:", error);
      return [];
    }
  }

  private getSymbolKindName(kind: vscode.SymbolKind): string {
    const kindMap: Record<vscode.SymbolKind, string> = {
      [vscode.SymbolKind.File]: "File",
      [vscode.SymbolKind.Module]: "Module",
      [vscode.SymbolKind.Namespace]: "Namespace",
      [vscode.SymbolKind.Package]: "Package",
      [vscode.SymbolKind.Class]: "Class",
      [vscode.SymbolKind.Method]: "Method",
      [vscode.SymbolKind.Property]: "Property",
      [vscode.SymbolKind.Field]: "Field",
      [vscode.SymbolKind.Constructor]: "Constructor",
      [vscode.SymbolKind.Enum]: "Enum",
      [vscode.SymbolKind.Interface]: "Interface",
      [vscode.SymbolKind.Function]: "Function",
      [vscode.SymbolKind.Variable]: "Variable",
      [vscode.SymbolKind.Constant]: "Constant",
      [vscode.SymbolKind.String]: "String",
      [vscode.SymbolKind.Number]: "Number",
      [vscode.SymbolKind.Boolean]: "Boolean",
      [vscode.SymbolKind.Array]: "Array",
      [vscode.SymbolKind.Object]: "Object",
      [vscode.SymbolKind.Key]: "Key",
      [vscode.SymbolKind.Null]: "Null",
      [vscode.SymbolKind.EnumMember]: "EnumMember",
      [vscode.SymbolKind.Struct]: "Struct",
      [vscode.SymbolKind.Event]: "Event",
      [vscode.SymbolKind.Operator]: "Operator",
      [vscode.SymbolKind.TypeParameter]: "TypeParameter",
    };

    return kindMap[kind] || "Symbol";
  }

  private async searchDocumentation(query: string): Promise<any[]> {
    try {
      const docFiles = await vscode.workspace.findFiles(
        `**/*${query}*.{md,mdx,rst,txt,markdown,mdown,markdn,textile,rdoc,org,creole,wiki,dokuwiki,mediawiki,pod,adoc,asciidoc,asc}`,
        "**/node_modules/**"
      );

      const fileResults = docFiles
        .slice(0, 25)
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
        "**/node_modules/**"
      );
      const filesToSearch = allDocFiles.slice(0, 15);
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

  private async searchConfigFiles(query: string): Promise<any[]> {
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

  private extractMultilineComments(
    text: string,
    fileExt: string
  ): { text: string; lineNumber: number }[] {
    const comments: { text: string; lineNumber: number }[] = [];

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
        const lineNumber =
          text.substring(0, match.index).split("\n").length - 1;
        comments.push({ text: comment, lineNumber });
      }
    } else if (fileExt === "py") {
      const regex =
        /(['"])(['"])\1[\s\S]*?\1\2\1|(['"])(['"])\3[\s\S]*?\3\4\3/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const comment = match[0];
        const lineNumber =
          text.substring(0, match.index).split("\n").length - 1;
        comments.push({ text: comment, lineNumber });
      }
    } else if (["html", "xml", "svg"].includes(fileExt)) {
      const regex = /<!--[\s\S]*?-->/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const comment = match[0];
        const lineNumber =
          text.substring(0, match.index).split("\n").length - 1;
        comments.push({ text: comment, lineNumber });
      }
    } else if (["md", "mdx", "markdown"].includes(fileExt)) {
      const regex = /<!--[\s\S]*?-->/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const comment = match[0];
        const lineNumber =
          text.substring(0, match.index).split("\n").length - 1;
        comments.push({ text: comment, lineNumber });
      }
    }

    return comments;
  }

  private async searchComments(query: string): Promise<any[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const commentResults: any[] = [];
      const processedLines = new Set<string>();

      const codePattern = new vscode.RelativePattern(
        vscode.workspace.workspaceFolders?.[0] || "",
        "**/*.{js,ts,jsx,tsx,java,c,cpp,cs,go,php,py,rb,rs,swift,kt,scala,h,hpp,m,mm,jade,pug,vue,svelte,html,css,scss,less,dart,lua,md,mdx,markdown}"
      );

      const files = await vscode.workspace.findFiles(
        codePattern,
        "**/node_modules/**"
      );

      const filesToSearch = files.slice(0, 25);

      for (const file of filesToSearch) {
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const text = document.getText();
          const lines = text.split(/\r?\n/);
          const fileExt = file.path.split(".").pop()?.toLowerCase() || "";
          const isMarkdown = ["md", "mdx", "markdown"].includes(fileExt);

          const multilineComments = this.extractMultilineComments(
            text,
            fileExt
          );
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
            multilineComments.map((c) => c.lineNumber)
          );

          const patterns: RegExp[] =
            this.getCommentPatternsForExtension(fileExt);

          for (let i = 0; i < lines.length; i++) {
            if (multilineLineNumbers.has(i)) {
              continue;
            }

            const line = lines[i].trim();

            if (!line) continue;

            let isComment = false;
            for (const pattern of patterns) {
              if (pattern.test(line)) {
                isComment = true;
                break;
              }
            }

            if (isComment && line.toLowerCase().includes(query.toLowerCase())) {
              let displayText = line;
              if (isMarkdown) {
                if (line.startsWith("<!--") && line.endsWith("-->")) {
                  displayText = line.substring(4, line.length - 3).trim();
                } else if (
                  line.startsWith("[comment]:") ||
                  line.startsWith("[//]:")
                ) {
                  displayText = line.substring(line.indexOf("#") + 1).trim();
                }
              }

              const uniqueKey = `${file.toString()}:${i}:${displayText}`;
              if (!processedLines.has(uniqueKey)) {
                processedLines.add(uniqueKey);
                commentResults.push({
                  type: "comment",
                  name: displayText,
                  path: vscode.workspace.asRelativePath(file),
                  uri: file.toString(),
                  lineNumber: i,
                });

                if (commentResults.length >= 50) {
                  break;
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

  private getCommentPatternsForExtension(ext: string): RegExp[] {
    const commonPatterns = [/^\s*\/\/.*/, /^\s*#.*/];

    switch (ext) {
      case "py":
        return [/^\s*#.*/, /^\s*""".*/, /^\s*'''.*/, /^\s*"""/];
      case "rb":
        return [/^\s*#.*/, /^\s*=begin.*/, /^\s*=end/];
      case "lua":
        return [/^\s*--.*/, /^\s*--\[\[.*/, /^\s*\]\]/];
      case "html":
      case "xml":
      case "svg":
        return [/^\s*<!--.*/, /^\s*-->/];
      case "md":
      case "mdx":
      case "markdown":
        return [
          /^\s*<!--.*/,
          /^\s*-->/,
          /^\s*\[comment\]:\s*#.*/,
          /^\s*\[\/\/\]:\s*#.*/,
        ];
      case "sql":
        return [/^\s*--.*/, /^\s*#.*/, /^\s*\/\*.*/];
      case "css":
      case "scss":
      case "less":
        return [/^\s*\/\*.*/, /^\s*\*\//, /^\s*\*.*/];
      case "hs":
        return [/^\s*--.*/, /^\s*{-.*/, /^\s*-}/];
      case "lisp":
      case "clj":
        return [/^\s*;.*/];
      case "vim":
        return [/^\s*".*/];
      default:
        return [/^\s*\/\/.*/, /^\s*\/\*.*/, /^\s*\*\//, /^\s*\*.*/, /^\s*#.*/];
    }
  }

  private handleResultSelection(item: any) {
    try {
      const uri = vscode.Uri.parse(item.uri);

      vscode.workspace
        .openTextDocument(uri)
        .then((document) => {
          return vscode.window.showTextDocument(document).then((editor) => {
            if (typeof item.lineNumber === "number") {
              const lineNumber = item.lineNumber;
              const line = document.lineAt(lineNumber);

              const range = new vscode.Range(
                lineNumber,
                0,
                lineNumber,
                line.text.length
              );

              editor.selection = new vscode.Selection(range.start, range.end);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }
          });
        })
        .then(undefined, (error: Error) => {
          console.error("Error opening document:", error);
          vscode.window.showErrorMessage(
            `Could not open file: ${error.message}`
          );
        });
    } catch (error) {
      console.error("Error handling result selection:", error);
      vscode.window.showErrorMessage(`Error opening file: ${error}`);
    }
  }

  private _update() {
    this._panel.title = "Smart Search";
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview() {
    const fileIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "file.svg"
    );
    const textIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "text.svg"
    );
    const symbolIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "symbol.svg"
    );
    const docIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "doc.svg"
    );
    const configIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "config.svg"
    );
    const commentIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "comment.svg"
    );
    const allIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "all.svg"
    );

    const fileIconSrc = this._panel.webview
      .asWebviewUri(fileIconPath)
      .toString();
    const textIconSrc = this._panel.webview
      .asWebviewUri(textIconPath)
      .toString();
    const symbolIconSrc = this._panel.webview
      .asWebviewUri(symbolIconPath)
      .toString();
    const docIconSrc = this._panel.webview.asWebviewUri(docIconPath).toString();
    const configIconSrc = this._panel.webview
      .asWebviewUri(configIconPath)
      .toString();
    const commentIconSrc = this._panel.webview
      .asWebviewUri(commentIconPath)
      .toString();
    const allIconSrc = this._panel.webview.asWebviewUri(allIconPath).toString();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Smart Search</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 0;
          margin: 0;
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
        }
        .container {
          width: 90%;
          max-width: 700px;
          margin: 10px auto;
          padding: 10px;
        }
        .search-box {
          width: 80%;
          padding: 10px;
          font-size: 16px;
          margin-bottom: 10px;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-activeBorder);
          border-radius: 8px;
          outline: none;
        }
        .tabs {
          display: flex;
          border-bottom: 1px solid var(--vscode-panel-border);
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .tab {
          padding: 6px 12px;
          cursor: pointer;
          border: none;
          background: none;
          color: var(--vscode-foreground);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tab.active {
          border-bottom: 2px solid var(--vscode-focusBorder);
          font-weight: bold;
        }
        .tab-icon {
          width: 16px;
          height: 16px;
        }
        .results {
          max-height: 500px;
          overflow-y: auto;
        }
        .result-item {
          padding: 6px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          overflow: hidden;
          border-radius: 4px;
          font-size: 14px;
        }
        .result-item:hover {
          background-color: var(--vscode-list-hoverBackground);
        }
        .result-item.selected {
          background-color: var(--vscode-list-activeSelectionBackground);
          color: var(--vscode-list-activeSelectionForeground);
        }
        .result-icon {
          width: 18px;
          height: 18px;
          margin-right: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .result-icon img {
          width: 18px;
          height: 18px;
        }
        .result-content {
          display: flex;
          align-items: center;
          min-width: 0;
          flex: 1;
        }
        .result-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          min-width: 0;
        }
        .result-path {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin-left: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
          flex-shrink: 0;
        }
        .results-counter {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin-bottom: 8px;
          padding-left: 2px;
        }
        .line-number {
          font-size: 12px;
          color: var(--vscode-badge-foreground);
          background-color: var(--vscode-badge-background);
          border-radius: 4px;
          padding: 3px 5px;
          margin-right: 5px;
        }
        .symbol-badge {
          font-size: 13px;
          color: var(--vscode-badge-foreground);
          background-color: var(--vscode-badge-background);
          border-radius: 4px;
          padding: 3px 5px;
          margin-right: 5px;
        }
        .no-results {
          font-style: italic;
          color: var(--vscode-descriptionForeground);
          padding: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <input type="text" class="search-box" id="searchInput" placeholder="Search..." autofocus>
        <div class="tabs">
          <button class="tab active" data-category="all">
            <img src="${allIconSrc}" alt="All" class="tab-icon">
            All
          </button>
          <button class="tab" data-category="files">
            <img src="${fileIconSrc}" alt="Files" class="tab-icon">
            Files
          </button>
          <button class="tab" data-category="text">
            <img src="${textIconSrc}" alt="Text" class="tab-icon">
            Text
          </button>
          <button class="tab" data-category="symbols">
            <img src="${symbolIconSrc}" alt="Symbols" class="tab-icon">
            Symbols
          </button>
          <button class="tab" data-category="docs">
            <img src="${docIconSrc}" alt="Docs" class="tab-icon">
            Docs
          </button>
          <button class="tab" data-category="config">
            <img src="${configIconSrc}" alt="Config" class="tab-icon">
            Config
          </button>
          <button class="tab" data-category="comments">
            <img src="${commentIconSrc}" alt="Comments" class="tab-icon">
            Comments
          </button>
        </div>
        <div class="results-counter" id="resultsCounter"></div>
        <div class="results" id="searchResults">
          <div class="no-results">Type to search</div>
        </div>
      </div>

      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          let currentCategory = 'all';
          let searchTimeout;
          let lastSearchText = '';
          let searchResults = [];
          let selectedResultIndex = -1;
          
          const iconSources = {
            'all': '${allIconSrc}',
            'file': '${fileIconSrc}',
            'text': '${textIconSrc}',
            'doc': '${docIconSrc}',
            'config': '${configIconSrc}',
            'comment': '${commentIconSrc}',
            'symbol': '${symbolIconSrc}'
          };
          
          const previousState = vscode.getState() || { searchText: '', category: 'all' };
          currentCategory = previousState.category || 'all';
          
          document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('searchInput');
            
            if (previousState.searchText) {
              searchInput.value = previousState.searchText;
              lastSearchText = previousState.searchText;
              performSearch(previousState.searchText, currentCategory);
            }
            
            document.querySelectorAll('.tab').forEach(tab => {
              if (tab.dataset.category === currentCategory) {
                tab.classList.add('active');
              } else {
                tab.classList.remove('active');
              }
            });
            
            searchInput.focus();
            
            searchInput.addEventListener('input', () => {
              const searchText = searchInput.value.trim();
              
              if (searchText === lastSearchText) {
                return;
              }
              
              lastSearchText = searchText;
              
              vscode.setState({ searchText: searchText, category: currentCategory });
              
              if (searchTimeout) {
                clearTimeout(searchTimeout);
              }
              
              searchTimeout = setTimeout(() => {
                if (searchText) {
                  performSearch(searchText, currentCategory);
                } else {
                  displayNoResults('Type to search');
                }
              }, 300);
            });
            
            document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => {
                  t.classList.remove('active');
                });
                
                tab.classList.add('active');
                
                currentCategory = tab.dataset.category;
                
                vscode.setState({ searchText: lastSearchText, category: currentCategory });
                
                const searchText = searchInput.value.trim();
                if (searchText) {
                  performSearch(searchText, currentCategory);
                }
              });
            });
          });
          
          function performSearch(text, category) {
            vscode.postMessage({
              command: 'search',
              text: text,
              category: category
            });
            
            displayNoResults('Searching...');
          }
          
          function displayNoResults(message) {
            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = \`<div class="no-results">\${message}</div>\`;
            document.getElementById('resultsCounter').textContent = '';
          }
          
          function displayResults(results) {
            const resultsContainer = document.getElementById('searchResults');
            const resultsCounter = document.getElementById('resultsCounter');
            
            if (!results || results.length === 0) {
              displayNoResults('No results found');
              return;
            }
            
            const validResults = results.filter(item => {
              if (!item || !item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
                return false;
              }
              
              const searchQuery = document.getElementById('searchInput').value.trim();
              if (searchQuery && item.type !== 'file' && item.type !== 'symbol') {
                const contentWithoutQuery = item.name.replace(new RegExp(searchQuery, 'gi'), '').trim();
                return item.name.length > (searchQuery.length + 3) || contentWithoutQuery.length > 0;
              }
              
              return true;
            });
            
            searchResults = validResults;
            selectedResultIndex = -1;
            
            if (searchResults.length === 0) {
              displayNoResults('No valid results found');
              return;
            }
            
            resultsCounter.textContent = \`\${searchResults.length} result\${searchResults.length === 1 ? '' : 's'}\`;
            
            searchResults.forEach((item, idx) => {
              item._originalIndex = idx;
            });
            
            let html = '';
            const searchQuery = document.getElementById('searchInput').value.trim();
            
            searchResults.forEach((item) => {
              const iconSrc = iconSources[item.type] || '';
              let path = item.path || '';
              
              let displayName = item.name;
              let fullName = item.name;
              
              const escapeHtml = (text) => {
                return text
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
              };
              
              if (item.name && searchQuery) {
                fullName = escapeHtml(item.name);
                
                if (item.name.length > 80 && searchQuery.length > 0) {
                  const lowerName = item.name.toLowerCase();
                  const lowerQuery = searchQuery.toLowerCase();
                  const matchIndex = lowerName.indexOf(lowerQuery);
                  
                  if (matchIndex !== -1) {
                    let startPos = Math.max(0, matchIndex - 40);
                    let endPos = Math.min(item.name.length, matchIndex + searchQuery.length + 40);
                    
                    if (startPos > 0) {
                      const prevSpace = item.name.lastIndexOf(' ', startPos);
                      if (prevSpace !== -1 && startPos - prevSpace < 10) {
                        startPos = prevSpace + 1;
                      }
                    }
                    
                    if (endPos < item.name.length) {
                      const nextSpace = item.name.indexOf(' ', endPos);
                      if (nextSpace !== -1 && nextSpace - endPos < 10) {
                        endPos = nextSpace;
                      }
                    }
                    
                    let contextString = item.name.substring(startPos, endPos);
                    
                    if (startPos > 0) contextString = '...' + contextString;
                    if (endPos < item.name.length) contextString += '...';
                    
                    const tempElement = document.createElement('div');
                    tempElement.textContent = contextString;
                    const htmlContextString = tempElement.innerHTML;
                    
                    const highlightedString = htmlContextString.replace(
                      new RegExp(escapeHtml(searchQuery), 'gi'),
                      match => \`<mark style="background-color: var(--vscode-editor-findMatchHighlightBackground); color: var(--vscode-editor-findMatchHighlightForeground);">\${match}</mark>\`
                    );
                    
                    displayName = highlightedString;
                  } else {
                    displayName = item.name.substring(0, 80) + '...';
                  }
                } else {
                  const tempElement = document.createElement('div');
                  tempElement.textContent = item.name;
                  const htmlString = tempElement.innerHTML;
                  
                  displayName = htmlString.replace(
                    new RegExp(escapeHtml(searchQuery), 'gi'),
                    match => \`<mark style="background-color: var(--vscode-editor-findMatchHighlightBackground); color: var(--vscode-editor-findMatchHighlightForeground);">\${match}</mark>\`
                  );
                }
                
                if ((item.type === 'text' || item.type === 'doc' || item.type === 'config' || item.type === 'comment') && typeof item.lineNumber === 'number') {
                  displayName = \`<span class="line-number">\${item.lineNumber + 1}</span> \${displayName}\`;
                } else if (item.type === 'symbol' && item.kindName) {
                  displayName = \`<span class="symbol-badge">\${item.kindName}</span> \${displayName}\`;
                }
              } else {
                fullName = escapeHtml(item.name);
                if ((item.type === 'text' || item.type === 'doc' || item.type === 'config' || item.type === 'comment') && typeof item.lineNumber === 'number') {
                  displayName = \`<span class="line-number">\${item.lineNumber + 1}</span> \${item.name}\`;
                } else if (item.type === 'symbol' && item.kindName) {
                  displayName = \`<span class="symbol-badge">\${item.kindName}</span> \${item.name}\`;
                }
              }
              
              html += \`
                <div class="result-item" data-index="\${item._originalIndex}" title="\${fullName}">
                  <div class="result-icon"><img src="\${iconSrc}" alt="\${item.type}"></div>
                  <div class="result-content">
                    <div class="result-name">\${displayName}</div>
                    <div class="result-path">\${path}</div>
                  </div>
                </div>
              \`;
            });
            
            resultsContainer.innerHTML = html;
            
            document.querySelectorAll('.result-item').forEach(item => {
              item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                vscode.postMessage({
                  command: 'selectResult',
                  item: searchResults[index]
                });
              });
            });
          }
          
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
              case 'searchResults':
                displayResults(message.results);
                break;
            }
          });

          document.addEventListener('keydown', (e) => {
            if (searchResults.length === 0) return;

            const resultElements = document.querySelectorAll('.result-item');
            
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              
              if (selectedResultIndex < searchResults.length - 1) {
                if (selectedResultIndex >= 0) {
                  resultElements[selectedResultIndex].classList.remove('selected');
                }
                
                selectedResultIndex++;
                resultElements[selectedResultIndex].classList.add('selected');
                resultElements[selectedResultIndex].scrollIntoView({ block: 'nearest' });
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              
              if (selectedResultIndex > 0) {
                resultElements[selectedResultIndex].classList.remove('selected');
                selectedResultIndex--;
                resultElements[selectedResultIndex].classList.add('selected');
                resultElements[selectedResultIndex].scrollIntoView({ block: 'nearest' });
              }
            } else if (e.key === 'Enter' && selectedResultIndex >= 0) {
              e.preventDefault();
              
              vscode.postMessage({
                command: 'selectResult',
                item: searchResults[selectedResultIndex]
              });
            }
          });
        })();
      </script>
    </body>
    </html>`;
  }

  public dispose() {
    SearchPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

export function deactivate() {}
