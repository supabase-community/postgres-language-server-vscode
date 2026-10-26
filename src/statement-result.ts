/**
 * The result of the `pgls.executeStatement` command and its rendering as HTML.
 *
 * This module doesn't import `vscode`, so that the rendering doesn't depend on
 * the editor.
 */

/** The command of the language server that executes the statement under the cursor. */
export const EXECUTE_STATEMENT_COMMAND = "pgls.executeStatement";

/** A position in a document, as in the LSP: zero-based line and UTF-16 character. */
export type Position = {
  line: number;
  character: number;
};

/** An error that Postgres raised while executing the statement. */
export type ExecuteStatementError = {
  /** The primary error message, e.g. `division by zero`. */
  message: string;
  /** The SQLSTATE error code, e.g. `22012`. */
  code: string;
  detail?: string;
  hint?: string;
  /** Where in the document the error is, if Postgres reported a position. */
  position?: Position | null;
};

/**
 * What `pgls.executeStatement` returns. A statement that returns rows fills
 * `columns` and `rows`, any other statement sets `rowsAffected`.
 */
export type ExecuteStatementResult = {
  /** A short summary, which the server also shows with `window/showMessage`. */
  message: string;
  columns: string[];
  /** The values in their Postgres text representation, `null` for SQL `NULL`. */
  rows: (string | null)[][];
  /** Whether the statement returned more rows than `rows` holds. */
  truncated: boolean;
  rowsAffected?: number;
  error?: ExecuteStatementError;
  /** Whether long values were cut. Sent by servers that cap the size of values. */
  truncatedValues?: boolean;
};

/** What the results view shows. */
export type ResultView = {
  /** The SQL of the executed statement, if known. */
  statement?: string;
  /** How long the request took, in milliseconds. */
  durationMs?: number;
} & (
  | {
      kind: "result";
      result: ExecuteStatementResult;
      /** Whether the user cancelled the execution, but the server still sent the result. */
      finishedDespiteCancellation?: boolean;
    }
  /** The request failed, e.g. because the database is not reachable. */
  | { kind: "failure"; message: string }
  /** The user cancelled the execution and the server confirmed it. */
  | { kind: "cancelled" }
);

/**
 * Reads the value that `pgls.executeStatement` returned. `undefined` if it is
 * not a result, e.g. `null` from a server that only shows a message.
 */
export const parseExecuteStatementResult = (
  value: unknown
): ExecuteStatementResult | undefined => {
  if (!isObject(value) || typeof value.message !== "string") {
    return undefined;
  }

  return {
    message: value.message,
    columns: Array.isArray(value.columns) ? value.columns.map(String) : [],
    rows: Array.isArray(value.rows)
      ? value.rows
          .filter(Array.isArray)
          .map((row: unknown[]) =>
            row.map((cell) =>
              cell === null || cell === undefined ? null : String(cell)
            )
          )
      : [],
    truncated: value.truncated === true,
    rowsAffected:
      typeof value.rowsAffected === "number" ? value.rowsAffected : undefined,
    error: parseError(value.error),
    truncatedValues: value.truncatedValues === true,
  };
};

const parseError = (value: unknown): ExecuteStatementError | undefined => {
  if (!isObject(value) || typeof value.message !== "string") {
    return undefined;
  }

  const position = value.position;
  return {
    message: value.message,
    code: typeof value.code === "string" ? value.code : "",
    detail: typeof value.detail === "string" ? value.detail : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
    position:
      isObject(position) &&
      typeof position.line === "number" &&
      typeof position.character === "number"
        ? { line: position.line, character: position.character }
        : undefined,
  };
};

/**
 * The SQL of the statement in the first argument of `pgls.executeStatement`,
 * which the server serializes as `{ "Root": { "content": "..." } }` or
 * `{ "Child": { "content": "...", ... } }`.
 */
export const statementFromArgument = (value: unknown): string | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  for (const variant of Object.values(value)) {
    if (isObject(variant) && typeof variant.content === "string") {
      return variant.content;
    }
  }

  return undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Renders the view as the HTML document of a webview. */
export const renderResultHtml = (
  view: ResultView,
  options: { nonce: string; cspSource: string }
): string => {
  const { nonce, cspSource } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement Result</title>
  <style nonce="${nonce}">${STYLES}</style>
</head>
<body>
  ${renderStatement(view.statement)}
  ${renderBody(view)}
  <script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
};

const renderStatement = (statement: string | undefined): string =>
  statement ? `<pre class="statement">${escapeHtml(statement)}</pre>` : "";

const renderBody = (view: ResultView): string => {
  const duration =
    view.durationMs === undefined
      ? ""
      : ` <span class="muted">(${formatDuration(view.durationMs)})</span>`;

  if (view.kind === "failure") {
    return `<div class="error">
    <div class="error-title">Statement could not be executed${duration}</div>
    <div>${escapeHtml(view.message)}</div>
  </div>`;
  }

  if (view.kind === "cancelled") {
    return `<div class="summary">Execution cancelled${duration}</div>
  <div class="muted">A language server that can't cancel statements in the database may still have run it.</div>`;
  }

  const { result } = view;
  const parts: string[] = [];

  if (view.finishedDespiteCancellation) {
    parts.push(
      `<div class="note">The statement finished before it could be cancelled.</div>`
    );
  }

  if (result.error) {
    parts.push(renderError(result.error, duration));
  } else {
    parts.push(
      `<div class="summary">${escapeHtml(result.message)}${duration}</div>`
    );
  }

  const notes: string[] = [];
  if (result.truncated) {
    notes.push(
      `The statement returned more rows than the ${result.rows.length} shown.`
    );
  }
  if (result.truncatedValues) {
    notes.push("Some values were too long and were cut.");
  }
  if (notes.length > 0) {
    parts.push(
      `<div class="note">${notes.map(escapeHtml).join(" ")}</div>`
    );
  }

  if (result.columns.length > 0) {
    parts.push(renderTable(result.columns, result.rows));
  }

  return parts.join("\n  ");
};

const renderError = (error: ExecuteStatementError, duration: string) => {
  const lines: string[] = [
    `<div class="error-title">${escapeHtml(error.message)}${duration}</div>`,
  ];

  if (error.code) {
    lines.push(
      `<div><span class="label">SQLSTATE</span> ${escapeHtml(error.code)}</div>`
    );
  }
  if (error.detail) {
    lines.push(
      `<div><span class="label">Detail</span> ${escapeHtml(error.detail)}</div>`
    );
  }
  if (error.hint) {
    lines.push(
      `<div><span class="label">Hint</span> ${escapeHtml(error.hint)}</div>`
    );
  }
  if (error.position) {
    const { line, character } = error.position;
    lines.push(
      `<div><span class="label">Position</span> <a href="#" data-reveal>Line ${
        line + 1
      }, column ${character + 1}</a></div>`
    );
  }

  return `<div class="error">\n    ${lines.join("\n    ")}\n  </div>`;
};

const renderTable = (columns: string[], rows: (string | null)[][]) => {
  const header = columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = rows
    .map(
      (row, index) =>
        `<tr><td class="index">${index + 1}</td>${columns
          .map((_, column) => renderCell(row[column]))
          .join("")}</tr>`
    )
    .join("\n");

  return `<table>
    <thead><tr><th class="index"></th>${header}</tr></thead>
    <tbody>
${body}
    </tbody>
  </table>`;
};

const renderCell = (value: string | null | undefined) =>
  value === null || value === undefined
    ? `<td class="null">NULL</td>`
    : `<td>${escapeHtml(value)}</td>`;

const formatDuration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Asks the extension to reveal the position of the error in the document. */
const SCRIPT = `
const vscode = acquireVsCodeApi();
for (const link of document.querySelectorAll("[data-reveal]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    vscode.postMessage({ type: "reveal" });
  });
}
`;

const STYLES = `
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  padding: 8px 12px;
}
.statement {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
  white-space: pre-wrap;
  max-height: 8em;
  overflow: auto;
  margin: 0 0 8px;
  padding: 6px 8px;
  background: var(--vscode-textCodeBlock-background);
}
.summary { margin-bottom: 8px; }
.muted { color: var(--vscode-descriptionForeground); }
.error {
  margin-bottom: 8px;
  padding: 6px 8px;
  border-left: 3px solid var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground);
}
.error-title { color: var(--vscode-errorForeground); font-weight: bold; margin-bottom: 4px; }
.label { color: var(--vscode-descriptionForeground); display: inline-block; min-width: 6em; }
a { color: var(--vscode-textLink-foreground); }
.note { margin-bottom: 8px; color: var(--vscode-editorWarning-foreground); }
table {
  border-collapse: collapse;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
}
th, td {
  border: 1px solid var(--vscode-panel-border);
  padding: 2px 6px;
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
  max-width: 60ch;
  overflow-wrap: anywhere;
}
th { position: sticky; top: 0; background: var(--vscode-editor-background); }
.index { color: var(--vscode-descriptionForeground); text-align: right; }
.null { color: var(--vscode-descriptionForeground); font-style: italic; }
`;
