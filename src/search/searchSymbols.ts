import * as vscode from "vscode";

export async function searchSymbols(query: string): Promise<any[]> {
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
      kindName: getSymbolKindName(symbol.kind),
    }));
  } catch (error) {
    console.error("Symbol search error:", error);
    return [];
  }
}

function getSymbolKindName(kind: vscode.SymbolKind): string {
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
