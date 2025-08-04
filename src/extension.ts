import * as vscode from "vscode";
import { searchFiles } from "./search/searchFiles";
import { searchText } from "./search/searchText";
import { searchSymbols } from "./search/searchSymbols";
import { searchDocumentation } from "./search/searchDocumentation";
import { searchConfigurations } from "./search/searchConfigurations";
import { searchComments } from "./search/searchComments";
import { DEFAULT_EXCLUDED_FOLDERS } from "./utils/getCommentFormats";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "smart-search" is now active');

  const disposable = vscode.commands.registerCommand(
    "smart-search.openSearchPopup",
    () => {
      SearchPanel.createOrShow(context.extensionUri, context);
    }
  );

  context.subscriptions.push(disposable);
}

class SearchPanel {
  public static currentPanel: SearchPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _extensionContext: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];
  private _pinnedResults: any[] = [];
  private _tabOrder: string[] = [
    "all",
    "files",
    "text",
    "symbols",
    "docs",
    "config",
    "comments",
    "pinned",
  ];
  private _disabledTabs: string[] = [];
  private _excludedFolders: string[] = DEFAULT_EXCLUDED_FOLDERS;
  private _excludedGlobPatterns: string[] = [];
  private _allFolders: string[] = [];

  private normalizePathToWorkspace(path: string): string {
    if (!path) return "";

    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      if (path.includes(":") || path.startsWith("/")) {
        return vscode.workspace.asRelativePath(path, false);
      }
    }
    return path;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

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
        retainContextWhenHidden: true,
      }
    );

    panel.iconPath = vscode.Uri.joinPath(
      extensionUri,
      "assets",
      "icons",
      "search.png"
    );

    SearchPanel.currentPanel = new SearchPanel(panel, extensionUri, context);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._extensionContext = context;

    this._pinnedResults = this._extensionContext.globalState.get(
      "smartSearch.pinnedResults",
      []
    );

    this._tabOrder = this._extensionContext.globalState.get(
      "smartSearch.tabOrder",
      [
        "all",
        "files",
        "text",
        "symbols",
        "docs",
        "config",
        "comments",
        "pinned",
      ]
    );

    this._disabledTabs = this._extensionContext.globalState.get(
      "smartSearch.disabledTabs",
      []
    );

    this._excludedFolders = this._extensionContext.globalState.get(
      "smartSearch.excludedFolders",
      DEFAULT_EXCLUDED_FOLDERS
    );

    this._excludedGlobPatterns = this._extensionContext.globalState.get(
      "smartSearch.excludedGlobPatterns",
      []
    );

    this._allFolders = [];
    this.discoverWorkspaceFolders();

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.onDidChangeViewState(
      (e) => {
        if (this._panel.visible) {
          this._panel.webview.postMessage({ command: "focusSearchInput" });
        }
      },
      null,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.command === "webviewReady") {
          this._panel.webview.postMessage({
            command: "pinnedResults",
            results: this._pinnedResults,
          });

          this._panel.webview.postMessage({
            command: "tabSettings",
            tabOrder: this._tabOrder,
            disabledTabs: this._disabledTabs,
          });

          this._panel.webview.postMessage({
            command: "folderSettings",
            excludedFolders: this._excludedFolders,
            excludedGlobPatterns: this._excludedGlobPatterns,
            allFolders: this._allFolders,
          });
        }
      },
      undefined,
      this._disposables
    );

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "search":
            this.performSearch(message.text, message.category);
            return;
          case "selectResult":
            this.handleResultSelection(message.item);
            return;
          case "pinResult":
            this.pinResult(message.item);
            return;
          case "unpinResult":
            this.unpinResult(message.itemId);
            return;
          case "updateTabOrder":
            this.updateTabOrder(message.tabOrder);
            return;
          case "toggleTabVisibility":
            this.toggleTabVisibility(message.tabCategory);
            return;
          case "updateExcludedFolders":
            this.updateExcludedFolders(message.excludedFolders);
            return;
          case "updateExcludedGlobPatterns":
            this.updateExcludedGlobPatterns(message.excludedGlobPatterns);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  private updateTabOrder(newTabOrder: string[]) {
    if (!newTabOrder || !Array.isArray(newTabOrder) || newTabOrder.length === 0)
      return;

    this._tabOrder = newTabOrder;
    this._extensionContext.globalState.update(
      "smartSearch.tabOrder",
      this._tabOrder
    );
  }

  private toggleTabVisibility(tabCategory: string) {
    if (!tabCategory) return;

    const index = this._disabledTabs.indexOf(tabCategory);
    if (index !== -1) {
      this._disabledTabs.splice(index, 1);
    } else {
      this._disabledTabs.push(tabCategory);
    }

    this._extensionContext.globalState.update(
      "smartSearch.disabledTabs",
      this._disabledTabs
    );

    this._panel.webview.postMessage({
      command: "tabSettings",
      tabOrder: this._tabOrder,
      disabledTabs: this._disabledTabs,
    });
  }

  private updateExcludedFolders(excludedFolders: string[]) {
    if (!excludedFolders || !Array.isArray(excludedFolders)) return;

    this._excludedFolders = excludedFolders;
    this._extensionContext.globalState.update(
      "smartSearch.excludedFolders",
      this._excludedFolders
    );
  }

  private updateExcludedGlobPatterns(excludedGlobPatterns: string[]) {
    if (!excludedGlobPatterns || !Array.isArray(excludedGlobPatterns)) return;

    this._excludedGlobPatterns = excludedGlobPatterns;
    this._extensionContext.globalState.update(
      "smartSearch.excludedGlobPatterns",
      this._excludedGlobPatterns
    );
  }

  private filterResults(results: any[], query: string): any[] {
    return results.filter((item) => {
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
        item.type === "config" ||
        item.type === "comment"
      ) {
        const contentWithoutQuery = item.name
          .replace(new RegExp(query, "gi"), "")
          .trim();
        return (
          item.name.length > query.length + 3 || contentWithoutQuery.length > 0
        );
      }

      return true;
    });
  }

  private async discoverWorkspaceFolders() {
    try {
      if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0];
        const allFolders: string[] = [];

        const discoverFoldersRecursively = async (
          currentUri: vscode.Uri,
          currentPath: string = "",
          maxDepth: number = 1,
          currentDepth: number = 0
        ) => {
          if (currentDepth > maxDepth) return;

          try {
            const entries = await vscode.workspace.fs.readDirectory(currentUri);
            const directories = entries.filter(
              ([name, type]) => type === vscode.FileType.Directory
            );

            for (const [name] of directories) {
              const folderPath = currentPath ? `${currentPath}/${name}` : name;

              if (!name.startsWith(".") && !name.startsWith("__")) {
                allFolders.push(folderPath);
              }

              if (
                currentDepth < maxDepth &&
                !name.startsWith(".") &&
                !name.startsWith("__")
              ) {
                const subUri = vscode.Uri.joinPath(currentUri, name);
                await discoverFoldersRecursively(
                  subUri,
                  folderPath,
                  maxDepth,
                  currentDepth + 1
                );
              }
            }
          } catch (error) {
            console.error(`Error reading directory ${currentPath}:`, error);
          }
        };

        await discoverFoldersRecursively(workspaceRoot.uri);

        const existingDefaultFolders = DEFAULT_EXCLUDED_FOLDERS.filter(
          (folder) => allFolders.includes(folder)
        );

        const additionalFolders = allFolders.filter(
          (folder) => !DEFAULT_EXCLUDED_FOLDERS.includes(folder)
        );

        this._allFolders = [
          ...existingDefaultFolders,
          ...additionalFolders,
        ].sort();

        this._panel.webview.postMessage({
          command: "folderSettings",
          excludedFolders: this._excludedFolders,
          excludedGlobPatterns: this._excludedGlobPatterns,
          allFolders: this._allFolders,
        });
      }
    } catch (error) {
      console.error("Error discovering workspace folders:", error);
    }
  }

  private pinResult(item: any) {
    if (!item) return;

    const itemId = `${item.uri}:${item.lineNumber ?? 0}:${item.name}`;

    const existingIndex = this._pinnedResults.findIndex(
      (pinnedItem) =>
        `${pinnedItem.uri}:${pinnedItem.lineNumber ?? 0}:${pinnedItem.name}` ===
        itemId
    );

    if (existingIndex === -1) {
      this._pinnedResults.push({
        ...item,
        id: itemId,
        pinnedAt: new Date().getTime(),
      });

      this._extensionContext.globalState.update(
        "smartSearch.pinnedResults",
        this._pinnedResults
      );

      this._panel.webview.postMessage({
        command: "pinnedResults",
        results: this._pinnedResults,
      });
    }
  }

  private unpinResult(itemId: string) {
    if (!itemId) return;

    const index = this._pinnedResults.findIndex(
      (item) => `${item.uri}:${item.lineNumber ?? 0}:${item.name}` === itemId
    );

    if (index !== -1) {
      this._pinnedResults.splice(index, 1);

      this._extensionContext.globalState.update(
        "smartSearch.pinnedResults",
        this._pinnedResults
      );

      this._panel.webview.postMessage({
        command: "pinnedResults",
        results: this._pinnedResults,
      });

      if (this._pinnedResults.length === 0) {
        this._panel.webview.postMessage({
          command: "searchResults",
          results: [],
        });
      }
    }
  }

  private prioritizeOpenFileResults(results: any[]): any[] {
    const openFileUris = new Set(
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => (tab.input as vscode.TabInputText)?.uri?.toString())
        .filter(Boolean)
    );

    const openFileResults: any[] = [];
    const otherResults: any[] = [];

    for (const result of results) {
      if (result.uri && openFileUris.has(result.uri)) {
        openFileResults.push(result);
      } else {
        otherResults.push(result);
      }
    }

    return [...openFileResults, ...otherResults];
  }

  private async performSearch(query: string, category: string) {
    if (!query || query.trim().length === 0) {
      if (category === "pinned") {
        this._panel.webview.postMessage({
          command: "searchResults",
          results: this._pinnedResults,
        });
      } else {
        this._panel.webview.postMessage({
          command: "searchResults",
          results: [],
        });
      }
      return;
    }

    try {
      let results: any[] = [];
      let categoryCounts: Record<string, number> = {
        all: 0,
        files: 0,
        text: 0,
        symbols: 0,
        docs: 0,
        config: 0,
        comments: 0,
        pinned: 0,
      };

      if (category === "pinned") {
        results = this._pinnedResults.filter((item) =>
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        categoryCounts.pinned = results.length;
      } else {
        const fileResults = await searchFiles(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );
        const textResults = await searchText(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );
        const symbolResults = await searchSymbols(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );
        const docResults = await searchDocumentation(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );
        const configResults = await searchConfigurations(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );
        const commentResults = await searchComments(
          query,
          this._excludedFolders,
          this._excludedGlobPatterns
        );

        const filteredFileResults = this.filterResults(fileResults, query);
        const filteredTextResults = this.filterResults(textResults, query);
        const filteredSymbolResults = this.filterResults(symbolResults, query);
        const filteredDocResults = this.filterResults(docResults, query);
        const filteredConfigResults = this.filterResults(configResults, query);
        const filteredCommentResults = this.filterResults(
          commentResults,
          query
        );

        categoryCounts.files = filteredFileResults.length;
        categoryCounts.text = filteredTextResults.length;
        categoryCounts.symbols = filteredSymbolResults.length;
        categoryCounts.docs = filteredDocResults.length;
        categoryCounts.config = filteredConfigResults.length;
        categoryCounts.comments = filteredCommentResults.length;
        categoryCounts.all =
          filteredFileResults.length +
          filteredTextResults.length +
          filteredSymbolResults.length +
          filteredDocResults.length +
          filteredConfigResults.length +
          filteredCommentResults.length;

        switch (category) {
          case "all":
            results = [
              ...filteredFileResults,
              ...filteredTextResults,
              ...filteredSymbolResults,
              ...filteredDocResults,
              ...filteredConfigResults,
              ...filteredCommentResults,
            ];
            results = this.prioritizeOpenFileResults(results);
            break;
          case "files":
            results = this.prioritizeOpenFileResults(filteredFileResults);
            break;
          case "text":
            results = this.prioritizeOpenFileResults(filteredTextResults);
            break;
          case "symbols":
            results = this.prioritizeOpenFileResults(filteredSymbolResults);
            break;
          case "docs":
            results = this.prioritizeOpenFileResults(filteredDocResults);
            break;
          case "config":
            results = this.prioritizeOpenFileResults(filteredConfigResults);
            break;
          case "comments":
            results = this.prioritizeOpenFileResults(filteredCommentResults);
            break;
          default:
            results = [
              ...filteredFileResults,
              ...filteredTextResults,
              ...filteredSymbolResults,
              ...filteredDocResults,
              ...filteredConfigResults,
              ...filteredCommentResults,
            ];
            results = this.prioritizeOpenFileResults(results);
        }
      }

      this._panel.webview.postMessage({
        command: "searchResults",
        results,
        categoryCounts,
      });
    } catch (error) {
      console.error("Search error:", error);
      vscode.window.showErrorMessage(`Search error: ${error}`);
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
              const lineText = line.text;

              const searchQuery = item.searchQuery;

              if (
                searchQuery &&
                typeof searchQuery === "string" &&
                searchQuery.trim().length > 0
              ) {
                const searchRegex = new RegExp(searchQuery, "gi");
                const match = searchRegex.exec(lineText);

                if (match) {
                  const startPos = match.index;
                  const endPos = startPos + match[0].length;

                  const range = new vscode.Range(
                    lineNumber,
                    startPos,
                    lineNumber,
                    endPos
                  );

                  editor.selection = new vscode.Selection(
                    range.start,
                    range.end
                  );
                  editor.revealRange(
                    range,
                    vscode.TextEditorRevealType.InCenter
                  );
                  return;
                }
              }

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
    const pinnedIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "pinned.svg"
    );
    const settingsIconPath = vscode.Uri.joinPath(
      this._extensionUri,
      "assets",
      "icons",
      "settings.svg"
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
    const pinnedIconSrc = this._panel.webview
      .asWebviewUri(pinnedIconPath)
      .toString();
    const settingsIconSrc = this._panel.webview
      .asWebviewUri(settingsIconPath)
      .toString();

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
          width: 100%;
          max-width: 750px;
          margin: 10px auto;
          padding: 10px;
        }
        .search-box {
          width: 90%;
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
          position: relative;
        }
        .tab.active {
          border-bottom: 2px solid var(--vscode-focusBorder);
        }
        .tab.active::after {
          content: '';
          position: absolute;
          top: -2px;
          right: 4px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--vscode-badge-background);
        }
        .tab.disabled {
          opacity: 0.5;
          text-decoration: line-through;
        }
        .tab-count {
          font-size: 11px;
          color: var(--vscode-badge-foreground);
          background-color: var(--vscode-badge-background);
          border-radius: 10px;
          padding: 1px 5px;
          margin-left: 3px;
          min-width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .tab-count:empty {
          display: none;
        }
        .tab-shortcuts {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin: 0 0 4px 4px;
        }
        .tab-icon {
          width: 16px;
          height: 16px;
          filter: invert(1);
        }
        body.vscode-light .tab-icon,
        body.vscode-high-contrast-light .tab-icon {
          filter: invert(0);
        }
        .tabs-container {
          position: relative;
        }
        .tab-settings-toggle {
          position: absolute;
          right: 5px;
          top: -20px;
          background: var(--vscode-button-secondaryBackground);
          border: none;
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 3px;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .tab-settings-toggle:hover {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        .tab-settings-toggle img {
          filter: invert(1);
        }
        body.vscode-light .tab-settings-toggle img,
        body.vscode-high-contrast-light .tab-settings-toggle img {
          filter: invert(0);
        }
        .tab-settings-panel {
          display: none;
          position: absolute;
          top: 20px;
          right: 0;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          padding: 15px;
          z-index: 100;
          width: 350px;
          max-height: 500px;
          overflow-y: auto;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }
        .tab-settings-panel.visible {
          display: block;
        }
        .tab-settings-title {
          margin: 0 0 15px 0;
          font-size: 16px;
          font-weight: 600;
        }
        .settings-section {
          margin-bottom: 20px;
        }
        .settings-section:last-child {
          margin-bottom: 0;
        }
        .settings-section-title {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--vscode-foreground);
        }
        .settings-description {
          margin: 0 0 10px 0;
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }
        .tab-reorder-list {
          list-style-type: none;
          padding: 0;
          margin: 0;
        }
        .tab-reorder-item {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          background: var(--vscode-input-background);
          margin-bottom: 4px;
          border-radius: 3px;
          cursor: move;
          user-select: none;
          font-size: 13px;
        }
        .tab-reorder-item.dragging {
          opacity: 0.5;
        }
        .tab-reorder-handle {
          margin-right: 8px;
          cursor: grab;
          opacity: 0.7;
        }
        .tab-reorder-handle:hover {
          opacity: 1;
        }
        .tab-toggle-checkbox {
          margin-left: auto;
        }
        .tab-toggle-label {
          display: flex;
          align-items: center;
          margin-left: 8px;
          cursor: pointer;
        }
        .drag-item-ghost {
          opacity: 0.4;
          background: var(--vscode-editor-background);
        }
        .tab-draggable {
          cursor: grab;
        }
        .tab-draggable:active {
          cursor: grabbing;
        }
        .folder-exclude-list {
          max-height: 200px;
          overflow-y: auto;
        }
        .folder-exclude-item {
          display: flex;
          align-items: center;
          padding: 4px 8px;
          background: var(--vscode-input-background);
          margin-bottom: 4px;
          border-radius: 3px;
          font-size: 12px;
        }
        .folder-exclude-checkbox {
          margin-right: 8px;
        }
        .folder-exclude-label {
          flex: 1;
          cursor: pointer;
          font-family: var(--vscode-editor-font-family);
        }
        .glob-patterns-container {
          margin-top: 8px;
        }
        .glob-input-container {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .glob-pattern-input {
          flex: 1;
          padding: 6px 8px;
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border);
          color: var(--vscode-input-foreground);
          border-radius: 3px;
          font-size: 12px;
          font-family: var(--vscode-editor-font-family);
        }
        .add-glob-pattern-btn {
          padding: 6px 12px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
        }
        .add-glob-pattern-btn:hover {
          background: var(--vscode-button-hoverBackground);
        }
        .glob-patterns-list {
          max-height: 150px;
          overflow-y: auto;
        }
        .glob-pattern-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px;
          background: var(--vscode-input-background);
          margin-bottom: 4px;
          border-radius: 3px;
          font-size: 12px;
          font-family: var(--vscode-editor-font-family);
        }
        .glob-pattern-text {
          flex: 1;
          color: var(--vscode-foreground);
        }
        .remove-glob-pattern-btn {
          padding: 2px 6px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-size: 11px;
        }
        .remove-glob-pattern-btn:hover {
          background: var(--vscode-button-secondaryHoverBackground);
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
          position: relative;
          padding-right: 50px;
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
          filter: invert(1);
        }
        body.vscode-light .result-icon img,
        body.vscode-high-contrast-light .result-icon img {
          filter: invert(0);
        }
        .result-content {
          display: flex;
          align-items: center;
          min-width: 0;
          flex: 1;
          padding-right: 10px;
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
          max-width: 180px;
          flex-shrink: 0;
        }
        .results-counter {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin-bottom: 8px;
          padding-left: 2px;
        }
        .results-details {
          margin-left: 5px;
          font-size: 12px;
          opacity: 0.8;
          padding: 2px 5px;
          border-radius: 3px;
          background-color: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
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
        .pin-button {
          opacity: 0;
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: var(--vscode-button-secondaryBackground);
          border: none;
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 3px;
          transition: all 0.2s;
          z-index: 2;
          min-width: 30px;
        }
        .result-item:hover .pin-button {
          opacity: 1;
        }
        .pin-button:hover {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        .pinned-item .pin-button {
          opacity: 1;
          color: var(--vscode-button-foreground);
          background-color: var(--vscode-button-background);
        }
        .category-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          position: absolute;
          right: 50px;
          top: 50%;
          transform: translateY(-50%);
        }
        .category-badge {
          display: flex;
          align-items: center;
          font-size: 12px;
          background: var(--vscode-button-secondaryBackground);
          border: none;
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 3px;
          transition: all 0.2s;
          min-width: 30px;
          height: 22px;
          opacity: 1;
        }
        .category-badge:hover {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        .category-badge img {
          width: 12px;
          height: 12px;
          margin-right: 4px;
          filter: invert(1);
        }
        body.vscode-light .category-badge img,
        body.vscode-high-contrast-light .category-badge img {
          filter: invert(0);
        }
        .multi-category {
          padding-right: 120px;
        }
        .multi-category .result-icon {
          margin-left: 0;
        }
        .multi-category .pin-button {
          right: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <input type="text" class="search-box" id="searchInput" placeholder="Search..." autofocus>
        <div class="tab-shortcuts">←/→: Navigate categories | ↑/↓: Navigate results</div>
        <div class="tabs-container">
          <button class="tab-settings-toggle" id="tabSettingsToggle">
            <img src="${settingsIconSrc}" alt="Settings" class="tab-icon" style="width: 18px; height: 18px;">
          </button>
          <div class="tab-settings-panel" id="tabSettingsPanel">
            <h3 class="tab-settings-title">Search Settings</h3>
            
            <div class="settings-section">
              <h4 class="settings-section-title">Tab Order & Visibility</h4>
              <p class="settings-description">Drag to reorder tabs or toggle visibility</p>
              <ul class="tab-reorder-list" id="tabReorderList">
                <!-- Tab settings will be populated dynamically -->
              </ul>
            </div>
            
            <div class="settings-section">
              <h4 class="settings-section-title">Excluded Folders</h4>
              <p class="settings-description">Select folders to exclude from search</p>
              <div class="folder-exclude-list" id="folderExcludeList">
                <!-- Folder settings will be populated dynamically -->
              </div>
            </div>
            
            <div class="settings-section">
              <h4 class="settings-section-title">Glob Patterns</h4>
              <p class="settings-description">Add custom patterns to exclude (e.g., **/test/**, **/*.temp, src/**/cache/**)</p>
              <div class="glob-patterns-container">
                <div class="glob-input-container">
                  <input type="text" id="globPatternInput" placeholder="Enter glob pattern..." class="glob-pattern-input">
                  <button type="button" id="addGlobPatternBtn" class="add-glob-pattern-btn">Add</button>
                </div>
                <div class="glob-patterns-list" id="globPatternsList">
                  <!-- Glob patterns will be populated dynamically -->
                </div>
              </div>
            </div>
          </div>
          <div class="tabs" id="tabsContainer">
            <!-- Tabs will be populated dynamically -->
          </div>
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
          let pinnedResults = [];
          let selectedResultIndex = -1;
          let tabOrder = ['all', 'files', 'text', 'symbols', 'docs', 'config', 'comments', 'pinned'];
          let disabledTabs = [];
          let excludedFolders = ${JSON.stringify(DEFAULT_EXCLUDED_FOLDERS)};
          let excludedGlobPatterns = [];
          let allFolders = [];
          
          const iconSources = {
            'all': '${allIconSrc}',
            'file': '${fileIconSrc}',
            'files': '${fileIconSrc}',
            'text': '${textIconSrc}',
            'doc': '${docIconSrc}',
            'docs': '${docIconSrc}',
            'config': '${configIconSrc}',
            'comment': '${commentIconSrc}',
            'comments': '${commentIconSrc}',
            'symbol': '${symbolIconSrc}',
            'symbols': '${symbolIconSrc}',
            'pinned': '${pinnedIconSrc}'
          };
          
          const tabLabels = {
            'all': 'All',
            'files': 'Files',
            'text': 'Text',
            'symbols': 'Symbols',
            'docs': 'Docs',
            'config': 'Config',
            'comments': 'Comments',
            'pinned': 'Pinned'
          };
          
          const previousState = vscode.getState() || { searchText: '', category: 'all', pinnedResults: [] };
          currentCategory = previousState.category || 'all';
          pinnedResults = previousState.pinnedResults || [];
          
          function normalizePathDisplay(path) {
            if (!path) return '';
            
            if (path.includes(':') || path.startsWith('/')) {
              const parts = path.split(/[\\/]/);
              
              if (parts[0] && parts[0].includes(':')) {
                parts.shift();
              }
              
              const cleanParts = parts.filter(p => p.trim().length > 0);
              
              if (cleanParts.length > 2) {
                const projectIndicators = ['src', 'app', 'lib', 'test', 'source', 'docs'];
                
                let startIndex = -1;
                for (let i = 0; i < cleanParts.length; i++) {
                  if (projectIndicators.includes(cleanParts[i].toLowerCase()) && i > 0) {
                    startIndex = i - 1;
                    break;
                  }
                }
                
                if (startIndex === -1) {
                  startIndex = Math.max(0, cleanParts.length - 3);
                }
                
                return cleanParts.slice(startIndex).join('/');
              }
            }
            return path;
          }
          
          function isPinned(item) {
            if (!item || !item.uri) return false;
            const itemId = \`\${item.uri}:\${item.lineNumber ?? 0}:\${item.name}\`;
            return pinnedResults.some(pinned => 
              \`\${pinned.uri}:\${pinned.lineNumber ?? 0}:\${pinned.name}\` === itemId
            );
          }
          
          vscode.postMessage({ command: 'webviewReady' });
          
          document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('searchInput');
            
            searchInput.focus();
            
            setTimeout(() => {
              searchInput.focus();
              vscode.postMessage({ command: 'webviewReady' });
            }, 200);
            
            setupTabSettings();
            setupFolderSettings();
            renderTabs();
            
            document.querySelector('.container').addEventListener('click', (e) => {
              if (!e.target.closest('.result-item') && 
                  !e.target.closest('.tab') && 
                  !e.target.closest('.pin-button') &&
                  !e.target.closest('.category-badge') &&
                  !e.target.closest('.tab-settings-panel') &&
                  !e.target.closest('.tab-settings-toggle')) {
                searchInput.focus();
              }
            });
            
            if (previousState.searchText) {
              searchInput.value = previousState.searchText;
              lastSearchText = previousState.searchText;
              performSearch(previousState.searchText, currentCategory);
            } else if (currentCategory === 'pinned') {
              vscode.postMessage({
                command: 'search',
                text: '',
                category: 'pinned'
              });
            }
            
            searchInput.addEventListener('input', () => {
              const searchText = searchInput.value.trim();
              
              if (searchText === lastSearchText) {
                return;
              }
              
              lastSearchText = searchText;
              
              vscode.setState({ 
                searchText: searchText, 
                category: currentCategory,
                pinnedResults: pinnedResults
              });
              
              if (searchTimeout) {
                clearTimeout(searchTimeout);
              }
              
              searchTimeout = setTimeout(() => {
                if (searchText || currentCategory === 'pinned') {
                  performSearch(searchText, currentCategory);
                } else {
                  displayNoResults('Type to search');
                }
              }, 300);
            });
          });
          
          function renderTabs() {
            const tabsContainer = document.getElementById('tabsContainer');
            if (!tabsContainer) return;
            
            tabsContainer.innerHTML = '';
            
            tabOrder.forEach(category => {
              if (disabledTabs.includes(category)) return;
              
              const tabButton = document.createElement('button');
              tabButton.className = 'tab tab-draggable';
              tabButton.dataset.category = category;
              
              if (category === currentCategory) {
                tabButton.classList.add('active');
              }
              
              const iconImg = document.createElement('img');
              iconImg.src = iconSources[category] || '';
              iconImg.alt = tabLabels[category] || category;
              iconImg.className = 'tab-icon';
              
              const tabText = document.createTextNode(tabLabels[category] || category);
              
              const countSpan = document.createElement('span');
              countSpan.className = 'tab-count';
              
              tabButton.appendChild(iconImg);
              tabButton.appendChild(tabText);
              tabButton.appendChild(countSpan);
              
              tabButton.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => {
                  t.classList.remove('active');
                });
                
                tabButton.classList.add('active');
                
                currentCategory = category;
                
                vscode.setState({ 
                  searchText: lastSearchText, 
                  category: currentCategory,
                  pinnedResults: pinnedResults
                });
                
                const searchText = document.getElementById('searchInput').value.trim();
                if (searchText || currentCategory === 'pinned') {
                  performSearch(searchText, currentCategory);
                } else if (currentCategory === 'pinned') {
                  vscode.postMessage({
                    command: 'search',
                    text: '',
                    category: 'pinned'
                  });
                }
                
                document.getElementById('searchInput').focus();
              });
              
              tabsContainer.appendChild(tabButton);
            });
            
            if (pinnedResults.length > 0) {
              const pinnedCountElement = document.querySelector('.tab[data-category="pinned"] .tab-count');
              if (pinnedCountElement) {
                pinnedCountElement.textContent = pinnedResults.length.toString();
              }
            }
            
            const tabs = document.querySelectorAll('.tab-draggable');
            tabs.forEach(tab => {
              tab.setAttribute('draggable', 'true');
              
              tab.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', tab.dataset.category);
                tab.classList.add('dragging');
              });
              
              tab.addEventListener('dragend', () => {
                tab.classList.remove('dragging');
              });
              
              tab.addEventListener('dragover', (e) => {
                e.preventDefault();
              });
              
              tab.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedCategory = e.dataTransfer.getData('text/plain');
                const targetCategory = tab.dataset.category;
                
                if (draggedCategory !== targetCategory) {
                  const newOrder = [...tabOrder];
                  const draggedIndex = newOrder.indexOf(draggedCategory);
                  const targetIndex = newOrder.indexOf(targetCategory);
                  
                  if (draggedIndex !== -1 && targetIndex !== -1) {
                    newOrder.splice(draggedIndex, 1);
                    newOrder.splice(targetIndex, 0, draggedCategory);
                    
                    tabOrder = newOrder;
                    vscode.postMessage({
                      command: 'updateTabOrder',
                      tabOrder: newOrder
                    });
                    
                    renderTabs();
                    updateTabSettingsPanel();
                  }
                }
              });
            });
          }
          
          function setupTabSettings() {
            const tabSettingsToggle = document.getElementById('tabSettingsToggle');
            const tabSettingsPanel = document.getElementById('tabSettingsPanel');
            
            tabSettingsToggle.addEventListener('click', () => {
              tabSettingsPanel.classList.toggle('visible');
              if (tabSettingsPanel.classList.contains('visible')) {
                updateTabSettingsPanel();
              }
            });
            
            document.addEventListener('click', (e) => {
              if (!e.target.closest('#tabSettingsPanel') && 
                  !e.target.closest('#tabSettingsToggle') && 
                  tabSettingsPanel.classList.contains('visible')) {
                tabSettingsPanel.classList.remove('visible');
              }
            });
          }
          
          function updateTabSettingsPanel() {
            const tabReorderList = document.getElementById('tabReorderList');
            if (!tabReorderList) return;
            
            tabReorderList.innerHTML = '';
            
            tabOrder.forEach((category, index) => {
              const listItem = document.createElement('li');
              listItem.className = 'tab-reorder-item';
              listItem.setAttribute('draggable', 'true');
              listItem.dataset.category = category;
              
              const handleSpan = document.createElement('span');
              handleSpan.className = 'tab-reorder-handle';
              handleSpan.innerHTML = '⠿';
              
              const iconImg = document.createElement('img');
              iconImg.src = iconSources[category] || '';
              iconImg.alt = tabLabels[category] || category;
              iconImg.className = 'tab-icon';
              iconImg.style.marginRight = '5px';
              
              const labelSpan = document.createElement('span');
              labelSpan.textContent = tabLabels[category] || category;
              
              const toggleLabel = document.createElement('label');
              toggleLabel.className = 'tab-toggle-label';
              
              const toggleCheckbox = document.createElement('input');
              toggleCheckbox.type = 'checkbox';
              toggleCheckbox.className = 'tab-toggle-checkbox';
              toggleCheckbox.checked = !disabledTabs.includes(category);
              
              toggleCheckbox.addEventListener('change', () => {
                vscode.postMessage({
                  command: 'toggleTabVisibility',
                  tabCategory: category
                });
                
                if (toggleCheckbox.checked) {
                  const index = disabledTabs.indexOf(category);
                  if (index !== -1) {
                    disabledTabs.splice(index, 1);
                  }
                } else {
                  if (!disabledTabs.includes(category)) {
                    disabledTabs.push(category);
                  }
                }
                
                renderTabs();
              });
              
              listItem.appendChild(handleSpan);
              listItem.appendChild(iconImg);
              listItem.appendChild(labelSpan);
              toggleLabel.appendChild(toggleCheckbox);
              listItem.appendChild(toggleLabel);
              
              tabReorderList.appendChild(listItem);
              
              listItem.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', category);
                listItem.classList.add('dragging');
              });
              
              listItem.addEventListener('dragend', () => {
                listItem.classList.remove('dragging');
              });
              
              listItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              });
              
              listItem.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedCategory = e.dataTransfer.getData('text/plain');
                const targetCategory = category;
                
                if (draggedCategory !== targetCategory) {
                  const newOrder = [...tabOrder];
                  const draggedIndex = newOrder.indexOf(draggedCategory);
                  const targetIndex = newOrder.indexOf(targetCategory);
                  
                  if (draggedIndex !== -1 && targetIndex !== -1) {
                    newOrder.splice(draggedIndex, 1);
                    newOrder.splice(targetIndex, 0, draggedCategory);
                    
                    tabOrder = newOrder;
                    vscode.postMessage({
                      command: 'updateTabOrder',
                      tabOrder: newOrder
                    });
                    
                    updateTabSettingsPanel();
                    renderTabs();
                  }
                }
              });
            });
          }
          
          function setupFolderSettings() {
            updateFolderSettingsPanel();
            setupGlobPatterns();
          }
          
          function updateFolderSettingsPanel() {
            const folderExcludeList = document.getElementById('folderExcludeList');
            if (!folderExcludeList) return;
            
            folderExcludeList.innerHTML = '';
            
            const sortedFolders = allFolders && allFolders.length > 0 ? allFolders.sort() : [];
            
            sortedFolders.forEach(folderName => {
              const folderItem = document.createElement('div');
              folderItem.className = 'folder-exclude-item';
              
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.className = 'folder-exclude-checkbox';
              checkbox.id = \`folder-\${folderName}\`;
              checkbox.checked = excludedFolders.includes(folderName);
              
              const label = document.createElement('label');
              label.className = 'folder-exclude-label';
              label.htmlFor = \`folder-\${folderName}\`;
              label.textContent = folderName;
              
              checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                  if (!excludedFolders.includes(folderName)) {
                    excludedFolders.push(folderName);
                  }
                } else {
                  const index = excludedFolders.indexOf(folderName);
                  if (index !== -1) {
                    excludedFolders.splice(index, 1);
                  }
                }
                
                vscode.postMessage({
                  command: 'updateExcludedFolders',
                  excludedFolders: excludedFolders
                });
              });
              
              folderItem.appendChild(checkbox);
              folderItem.appendChild(label);
              folderExcludeList.appendChild(folderItem);
            });
          }
          
          function setupGlobPatterns() {
            const addBtn = document.getElementById('addGlobPatternBtn');
            const input = document.getElementById('globPatternInput');
            
            if (addBtn && input) {
              addBtn.addEventListener('click', () => {
                const pattern = input.value.trim();
                if (pattern) {
                  addGlobPattern(pattern);
                  input.value = '';
                }
              });
              
              input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                  const pattern = input.value.trim();
                  if (pattern) {
                    addGlobPattern(pattern);
                    input.value = '';
                  }
                }
              });
            }
            
            updateGlobPatternsPanel();
          }
          
          function addGlobPattern(pattern) {
            if (!excludedGlobPatterns.includes(pattern)) {
              excludedGlobPatterns.push(pattern);
              vscode.postMessage({
                command: 'updateExcludedGlobPatterns',
                excludedGlobPatterns: excludedGlobPatterns
              });
              updateGlobPatternsPanel();
            }
          }
          
          function removeGlobPattern(pattern) {
            const index = excludedGlobPatterns.indexOf(pattern);
            if (index !== -1) {
              excludedGlobPatterns.splice(index, 1);
              vscode.postMessage({
                command: 'updateExcludedGlobPatterns',
                excludedGlobPatterns: excludedGlobPatterns
              });
              updateGlobPatternsPanel();
            }
          }
          
          function updateGlobPatternsPanel() {
            const globPatternsList = document.getElementById('globPatternsList');
            if (!globPatternsList) return;
            
            globPatternsList.innerHTML = '';
            
            if (excludedGlobPatterns && excludedGlobPatterns.length > 0) {
              excludedGlobPatterns.forEach(pattern => {
                const patternItem = document.createElement('div');
                patternItem.className = 'glob-pattern-item';
                
                const patternText = document.createElement('span');
                patternText.className = 'glob-pattern-text';
                patternText.textContent = pattern;
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-glob-pattern-btn';
                removeBtn.textContent = 'Remove';
                removeBtn.addEventListener('click', () => {
                  removeGlobPattern(pattern);
                });
                
                patternItem.appendChild(patternText);
                patternItem.appendChild(removeBtn);
                globPatternsList.appendChild(patternItem);
              });
            }
          }
          
          function performSearch(text, category) {
            vscode.postMessage({
              command: 'search',
              text: text,
              category: category
            });
            
            if (category === 'pinned' && !text) {
              if (pinnedResults.length === 0) {
                displayNoResults('No pinned results yet. Pin results from other tabs.');
              }
            } else {
              displayNoResults('Searching... This might take a moment.');
            }
          }
          
          function displayNoResults(message) {
            const resultsContainer = document.getElementById('searchResults');
            resultsContainer.innerHTML = \`<div class="no-results">\${message}</div>\`;
            document.getElementById('resultsCounter').textContent = '';
            
            if (message === 'Type to search') {
              document.querySelectorAll('.tab:not([data-category="pinned"]) .tab-count').forEach(countElement => {
                countElement.textContent = '';
              });
            }
          }
          
          function pinResult(item, index) {
            vscode.postMessage({
              command: 'pinResult',
              item: item
            });
            
            const button = document.querySelector(\`.result-item[data-index="\${index}"] .pin-button\`);
            if (button) {
              button.textContent = "Unpin";
              button.closest('.result-item').classList.add('pinned-item');
            }
            
            const itemId = \`\${item.uri}:\${item.lineNumber ?? 0}:\${item.name}\`;
            if (!pinnedResults.some(pinned => 
              \`\${pinned.uri}:\${pinned.lineNumber ?? 0}:\${pinned.name}\` === itemId)) {
              pinnedResults.push({
                ...item,
                id: itemId,
                pinnedAt: new Date().getTime()
              });
              
              vscode.setState({ 
                searchText: lastSearchText, 
                category: currentCategory,
                pinnedResults: pinnedResults
              });
              
              const pinnedCountElement = document.querySelector('.tab[data-category="pinned"] .tab-count');
              if (pinnedCountElement) {
                pinnedCountElement.textContent = pinnedResults.length.toString();
              }
            }
          }
          
          function unpinResult(item, index) {
            const itemId = \`\${item.uri}:\${item.lineNumber ?? 0}:\${item.name}\`;
            
            vscode.postMessage({
              command: 'unpinResult',
              itemId: itemId
            });
            
            const button = document.querySelector(\`.result-item[data-index="\${index}"] .pin-button\`);
            if (button) {
              button.textContent = "Pin";
              button.closest('.result-item').classList.remove('pinned-item');
            }
            
            const pinnedIndex = pinnedResults.findIndex(pinned => 
              \`\${pinned.uri}:\${pinned.lineNumber ?? 0}:\${pinned.name}\` === itemId
            );
            
            if (pinnedIndex !== -1) {
              pinnedResults.splice(pinnedIndex, 1);
              
              vscode.setState({ 
                searchText: lastSearchText, 
                category: currentCategory,
                pinnedResults: pinnedResults
              });
              
              const pinnedCountElement = document.querySelector('.tab[data-category="pinned"] .tab-count');
              if (pinnedCountElement) {
                pinnedCountElement.textContent = pinnedResults.length > 0 ? pinnedResults.length.toString() : '';
              }
              
              if (currentCategory === 'pinned') {
                const searchInput = document.getElementById('searchInput');
                performSearch(searchInput.value.trim(), 'pinned');
              }
            }
          }
          
          function displayResults(results) {
            const resultsContainer = document.getElementById('searchResults');
            const resultsCounter = document.getElementById('resultsCounter');
            
            if (!results || results.length === 0) {
              if (currentCategory === 'pinned') {
                displayNoResults('No pinned results yet. Pin results from other tabs.');
              } else {
                displayNoResults('No results found');
              }
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
              if (currentCategory === 'pinned') {
                displayNoResults('No matching pinned results.');
              } else {
                displayNoResults('No valid results found');
              }
              return;
            }
            
            searchResults.forEach((item, idx) => {
              item._originalIndex = idx;
            });
            
            let html = '';
            const searchQuery = document.getElementById('searchInput').value.trim();
            
            const groupedResults = new Map();
            
            if (currentCategory === 'all') {
              searchResults.forEach((item) => {
                const key = \`\${item.uri}:\${item.lineNumber ?? 0}\`;
                
                if (!groupedResults.has(key)) {
                  groupedResults.set(key, {
                    mainItem: item,
                    categories: [item.type],
                    indices: [item._originalIndex]
                  });
                } else {
                  const group = groupedResults.get(key);
                  if (!group.categories.includes(item.type)) {
                    group.categories.push(item.type);
                  }
                  group.indices.push(item._originalIndex);
                }
              });
            }
            
            if (currentCategory === 'all' && groupedResults.size > 0) {
              const uniqueCount = groupedResults.size;
              const totalCount = searchResults.length;
              const duplicateCount = totalCount - uniqueCount;
              
              if (duplicateCount > 0) {
                resultsCounter.textContent = \`\${uniqueCount} unique results \`;
                const detailsSpan = document.createElement('span');
                detailsSpan.className = 'results-details';
                detailsSpan.textContent = \`\${totalCount} total across categories\`;
                resultsCounter.appendChild(detailsSpan);
              } else {
                resultsCounter.textContent = \`\${searchResults.length} result\${searchResults.length === 1 ? '' : 's'}\`;
              }
            } else {
              resultsCounter.textContent = \`\${searchResults.length} result\${searchResults.length === 1 ? '' : 's'}\`;
            }
            
            if (currentCategory === 'all' && groupedResults.size > 0) {
              for (const [key, group] of groupedResults.entries()) {
                const item = group.mainItem;
                const iconSrc = iconSources[item.type] || '';
                let path = normalizePathDisplay(item.path || '');
                
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
                    displayName = \`<span class="line-number">\${item.lineNumber + 1}</span> \${displayName}\`;
                  } else if (item.type === 'symbol' && item.kindName) {
                    displayName = \`<span class="symbol-badge">\${item.kindName}</span> \${displayName}\`;
                  }
                }
                
                const isPinnedItem = isPinned(item);
                const pinnedClass = isPinnedItem ? 'pinned-item' : '';
                const buttonText = isPinnedItem ? 'Unpin' : 'Pin';
                
                let categoryBadges = '';
                if (group.categories.length > 1) {
                  categoryBadges = '<div class="category-badges">';
                  group.categories.forEach(category => {
                    if (category !== item.type) {
                      const iconSrc = iconSources[category] || '';
                      let displayCategory = category;
                      if (category === 'file') displayCategory = 'Files';
                      else if (category === 'text') displayCategory = 'Text';
                      else if (category === 'doc') displayCategory = 'Docs';
                      else if (category === 'config') displayCategory = 'Config';
                      else if (category === 'comment') displayCategory = 'Comments';
                      else if (category === 'symbol') displayCategory = 'Symbols';
                      
                      categoryBadges += \`<span class="category-badge" title="Also appears in \${displayCategory}"><img src="\${iconSrc}" alt="\${category}">\${displayCategory}</span>\`;
                    }
                  });
                  categoryBadges += '</div>';
                }
                
                html += \`
                  <div class="result-item \${pinnedClass}\${group.categories.length > 1 ? ' multi-category' : ''}\" 
                       data-index="\${item._originalIndex}\" 
                       data-indices="\${group.indices.join(',')}"
                       title="\${fullName}">
                    <div class="result-icon"><img src="\${iconSrc}" alt="\${item.type}"></div>
                    <div class="result-content">
                      <div class="result-name">\${displayName}</div>
                      <div class="result-path">\${path}</div>
                      \${categoryBadges}
                    </div>
                    <button class="pin-button">\${buttonText}</button>
                  </div>
                \`;
              }
            } else {
              searchResults.forEach((item) => {
                const iconSrc = iconSources[item.type] || '';
                let path = normalizePathDisplay(item.path || '');
                
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
                
                const isPinnedItem = isPinned(item);
                const pinnedClass = isPinnedItem ? 'pinned-item' : '';
                const buttonText = isPinnedItem ? 'Unpin' : 'Pin';
                
                html += \`
                  <div class="result-item \${pinnedClass}" data-index="\${item._originalIndex}" title="\${fullName}">
                    <div class="result-icon"><img src="\${iconSrc}" alt="\${item.type}"></div>
                    <div class="result-content">
                      <div class="result-name">\${displayName}</div>
                      <div class="result-path">\${path}</div>
                    </div>
                    <button class="pin-button">\${buttonText}</button>
                  </div>
                \`;
              });
            }
            
            resultsContainer.innerHTML = html;
            
            document.querySelectorAll('.result-item').forEach(item => {
              const index = parseInt(item.dataset.index);
              const indices = item.dataset.indices ? item.dataset.indices.split(',').map(i => parseInt(i)) : [index];
              
              item.addEventListener('click', (e) => {
                if (e.target.classList.contains('pin-button') || e.target.classList.contains('category-badge')) {
                  return;
                }
                
                vscode.postMessage({
                  command: 'selectResult',
                  item: {
                    ...searchResults[index],
                    searchQuery: searchQuery
                  }
                });
              });
            });
            
            document.querySelectorAll('.pin-button').forEach(button => {
              button.addEventListener('click', (e) => {
                e.stopPropagation();
                const resultItem = button.closest('.result-item');
                const index = parseInt(resultItem.dataset.index);
                
                if (resultItem.classList.contains('pinned-item')) {
                  unpinResult(searchResults[index], index);
                } else {
                  pinResult(searchResults[index], index);
                }
              });
            });
            
            document.querySelectorAll('.category-badge').forEach(badge => {
              badge.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const img = badge.querySelector('img');
                const category = img ? img.getAttribute('alt') : null;
                
                if (category) {
                  document.querySelectorAll('.tab').forEach(tab => {
                    if (tab.dataset.category === category || 
                        (category === 'doc' && tab.dataset.category === 'docs') ||
                        (category === 'file' && tab.dataset.category === 'files') ||
                        (category === 'symbol' && tab.dataset.category === 'symbols') ||
                        (category === 'comment' && tab.dataset.category === 'comments')) {
                      tab.click();
                    }
                  });
                }
              });
            });
            
            if (searchResults.length > 0) {
              selectedResultIndex = 0;
              const firstResult = document.querySelector('.result-item');
              if (firstResult) {
                firstResult.classList.add('selected');
              }
            }
          }
          
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
              case 'searchResults':
                displayResults(message.results);
                
                if (message.categoryCounts) {
                  updateCategoryCounts(message.categoryCounts);
                }
                break;
              case 'pinnedResults':
                pinnedResults = message.results;
                vscode.setState({ 
                  searchText: lastSearchText, 
                  category: currentCategory,
                  pinnedResults: pinnedResults
                });
                
                if (searchResults.length > 0) {
                  document.querySelectorAll('.result-item').forEach(item => {
                    const index = parseInt(item.dataset.index);
                    const resultItem = searchResults[index];
                    if (resultItem) {
                      const isPinnedItem = isPinned(resultItem);
                      if (isPinnedItem) {
                        item.classList.add('pinned-item');
                        const pinButton = item.querySelector('.pin-button');
                        if (pinButton) {
                          pinButton.textContent = 'Unpin';
                        }
                      } else {
                        item.classList.remove('pinned-item');
                        const pinButton = item.querySelector('.pin-button');
                        if (pinButton) {
                          pinButton.textContent = 'Pin';
                        }
                      }
                    }
                  });
                }
                
                if (currentCategory === 'pinned') {
                  displayResults(pinnedResults);
                  
                  const pinnedCount = pinnedResults.length;
                  const pinnedCountElement = document.querySelector('.tab[data-category="pinned"] .tab-count');
                  if (pinnedCountElement) {
                    pinnedCountElement.textContent = pinnedCount > 0 ? pinnedCount.toString() : '';
                  }
                }
                break;
              case 'tabSettings':
                if (message.tabOrder && Array.isArray(message.tabOrder)) {
                  tabOrder = message.tabOrder;
                }
                
                if (message.disabledTabs && Array.isArray(message.disabledTabs)) {
                  disabledTabs = message.disabledTabs;
                }
                
                renderTabs();
                break;
              case 'folderSettings':
                if (message.excludedFolders && Array.isArray(message.excludedFolders)) {
                  excludedFolders = message.excludedFolders;
                }
                
                if (message.excludedGlobPatterns && Array.isArray(message.excludedGlobPatterns)) {
                  excludedGlobPatterns = message.excludedGlobPatterns;
                }
                
                if (message.allFolders && Array.isArray(message.allFolders)) {
                  allFolders = message.allFolders;
                }
                
                updateFolderSettingsPanel();
                updateGlobPatternsPanel();
                break;
              case 'focusSearchInput':
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                  searchInput.focus();
                }
                break;
            }
          });

          function updateCategoryCounts(categoryCounts) {
            for (const category in categoryCounts) {
              const count = categoryCounts[category];
              const countElement = document.querySelector(\`.tab[data-category="\${category}"] .tab-count\`);
              
              if (countElement) {
                countElement.textContent = count > 0 ? count.toString() : '';
              }
            }
          }

          document.addEventListener('keydown', (e) => {
            const searchInput = document.getElementById('searchInput');
            const activeElement = document.activeElement;
            
            if (e.key === 'Tab') {
              e.preventDefault();
              
              const tabs = document.querySelectorAll('.tab');
              const activeTabIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
              
              if (activeTabIndex !== -1) {
                tabs[activeTabIndex].classList.remove('active');
                
                let nextTabIndex = e.shiftKey ? activeTabIndex - 1 : activeTabIndex + 1;
                
                if (nextTabIndex < 0) {
                  nextTabIndex = tabs.length - 1;
                } else if (nextTabIndex >= tabs.length) {
                  nextTabIndex = 0;
                }
                
                tabs[nextTabIndex].classList.add('active');
                currentCategory = tabs[nextTabIndex].dataset.category;
                
                vscode.setState({ 
                  searchText: lastSearchText, 
                  category: currentCategory,
                  pinnedResults: pinnedResults
                });
                
                const searchText = searchInput.value.trim();
                if (searchText || currentCategory === 'pinned') {
                  performSearch(searchText, currentCategory);
                } else if (currentCategory === 'pinned') {
                  vscode.postMessage({
                    command: 'search',
                    text: '',
                    category: 'pinned'
                  });
                } else {
                  displayNoResults('Type to search');
                }
                
                return;
              }
            }
            
            if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement === searchInput) {
              e.preventDefault();
              
              const tabs = document.querySelectorAll('.tab');
              if (tabs.length === 0) return;
              
              const activeTabIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
              
              if (activeTabIndex !== -1) {
                tabs[activeTabIndex].classList.remove('active');
                
                let nextIndex = activeTabIndex;
                let foundTab = false;
                let attempts = 0;
                
                while (!foundTab && attempts < tabs.length) {
                  nextIndex = e.key === 'ArrowLeft' ? nextIndex - 1 : nextIndex + 1;
                  
                  if (nextIndex < 0) {
                    nextIndex = tabs.length - 1;
                  } else if (nextIndex >= tabs.length) {
                    nextIndex = 0;
                  }
                  
                  const tabCategory = tabs[nextIndex].dataset.category;
                  if (!disabledTabs.includes(tabCategory)) {
                    foundTab = true;
                  }
                  
                  attempts++;
                }
                
                tabs[nextIndex].classList.add('active');
                currentCategory = tabs[nextIndex].dataset.category;
                
                vscode.setState({ 
                  searchText: lastSearchText, 
                  category: currentCategory,
                  pinnedResults: pinnedResults
                });
                
                const searchText = searchInput.value.trim();
                if (searchText || currentCategory === 'pinned') {
                  performSearch(searchText, currentCategory);
                } else if (currentCategory === 'pinned') {
                  vscode.postMessage({
                    command: 'search',
                    text: '',
                    category: 'pinned'
                  });
                } else {
                  displayNoResults('Type to search');
                }
                
                return;
              } else if (tabs.length > 0) {
                const visibleTabs = Array.from(tabs).filter(tab => {
                  const category = tab.dataset.category;
                  return !disabledTabs.includes(category);
                });
                
                if (visibleTabs.length > 0) {
                  visibleTabs[0].classList.add('active');
                  currentCategory = visibleTabs[0].dataset.category;
                  
                  const searchText = searchInput.value.trim();
                  if (searchText || currentCategory === 'pinned') {
                    performSearch(searchText, currentCategory);
                  } else if (currentCategory === 'pinned') {
                    vscode.postMessage({
                      command: 'search',
                      text: '',
                      category: 'pinned'
                    });
                  } else {
                    displayNoResults('Type to search');
                  }
                }
                
                return;
              }
            }
            
            if (activeElement && activeElement.classList && activeElement.classList.contains('tab')) {
              return;
            }
            
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
              
              const searchQuery = document.getElementById('searchInput').value.trim();
              vscode.postMessage({
                command: 'selectResult',
                item: {
                  ...searchResults[selectedResultIndex],
                  searchQuery: searchQuery
                }
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
