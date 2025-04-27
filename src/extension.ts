import * as vscode from "vscode";
import { searchFiles } from "./search/searchFiles";
import { searchText } from "./search/searchText";
import { searchSymbols } from "./search/searchSymbols";
import { searchDocumentation } from "./search/searchDocumentation";
import { searchConfigurations } from "./search/searchConfigurations";
import { searchComments } from "./search/searchComments";

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
        }
      },
      null,
      this._disposables
    );
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
    }
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

      if (category === "pinned") {
        results = this._pinnedResults.filter((item) =>
          item.name.toLowerCase().includes(query.toLowerCase())
        );
      } else {
        const fileResults = await searchFiles(query);
        const textResults = await searchText(query);
        const symbolResults = await searchSymbols(query);
        const docResults = await searchDocumentation(query);
        const configResults = await searchConfigurations(query);
        const commentResults = await searchComments(query);

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
          item.type === "config" ||
          item.type === "comment"
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
        .tab-shortcuts {
          font-size: 13px;
          color: var(--vscode-descriptionForeground);
          margin: 0 0 4px 4px;
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
          <button class="tab" data-category="pinned">
            <img src="${pinnedIconSrc}" alt="Pinned" class="tab-icon">
            Pinned
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
          let pinnedResults = [];
          let selectedResultIndex = -1;
          
          const iconSources = {
            'all': '${allIconSrc}',
            'file': '${fileIconSrc}',
            'text': '${textIconSrc}',
            'doc': '${docIconSrc}',
            'config': '${configIconSrc}',
            'comment': '${commentIconSrc}',
            'symbol': '${symbolIconSrc}',
            'pinned': '${pinnedIconSrc}'
          };
          
          const previousState = vscode.getState() || { searchText: '', category: 'all', pinnedResults: [] };
          currentCategory = previousState.category || 'all';
          pinnedResults = previousState.pinnedResults || [];
          
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
            
            document.querySelector('.container').addEventListener('click', (e) => {
              if (!e.target.closest('.result-item') && 
                  !e.target.closest('.tab') && 
                  !e.target.closest('.pin-button') &&
                  !e.target.closest('.category-badge')) {
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
            
            document.querySelectorAll('.tab').forEach(tab => {
              if (tab.dataset.category === currentCategory) {
                tab.classList.add('active');
              } else {
                tab.classList.remove('active');
              }
            });
            
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
            
            document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => {
                  t.classList.remove('active');
                });
                
                tab.classList.add('active');
                
                currentCategory = tab.dataset.category;
                
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
                
                searchInput.focus();
              });
            });
          });
          
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
                }
                break;
              case 'focusSearchInput':
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                  searchInput.focus();
                }
                break;
            }
          });

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
              const activeTabIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));
              
              if (activeTabIndex !== -1) {
                tabs[activeTabIndex].classList.remove('active');
                
                let nextTabIndex = e.key === 'ArrowLeft' ? activeTabIndex - 1 : activeTabIndex + 1;
                
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
