import { randomBytes } from "node:crypto";
import {
  Position,
  Selection,
  TextEditorRevealType,
  Uri,
  ViewColumn,
  type WebviewPanel,
  window,
  workspace,
} from "vscode";
import { logger } from "./logger";
import { type ResultView, renderResultHtml } from "./statement-result";

/**
 * A webview beside the editor that shows the result of the last executed
 * statement. It is created on the first execution and reused afterwards.
 */
class ResultsPanel {
  private panel?: WebviewPanel;

  /** The document of the shown result, to reveal the position of an error in it. */
  private documentUri?: string;
  private view?: ResultView;

  show(view: ResultView, documentUri: string | undefined) {
    this.view = view;
    this.documentUri = documentUri;

    const panel = this.getOrCreatePanel();
    panel.webview.html = renderResultHtml(view, {
      nonce: randomBytes(16).toString("base64"),
      cspSource: panel.webview.cspSource,
    });
    panel.reveal(panel.viewColumn ?? ViewColumn.Beside, true);
  }

  private getOrCreatePanel(): WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = window.createWebviewPanel(
      "postgres-language-server.statementResult",
      "Statement Result",
      { viewColumn: ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [] }
    );

    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === "reveal"
      ) {
        this.revealError();
      }
    });

    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel = panel;
    return panel;
  }

  /** Selects the position of the error of the shown result in its document. */
  private async revealError() {
    const position =
      this.view?.kind === "result" ? this.view.result.error?.position : null;
    if (!position || !this.documentUri) {
      return;
    }

    try {
      const document = await workspace.openTextDocument(
        Uri.parse(this.documentUri)
      );
      const visible = window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === document.uri.toString()
      );
      const editor = await window.showTextDocument(document, {
        viewColumn: visible?.viewColumn ?? ViewColumn.One,
      });
      const target = new Position(position.line, position.character);
      editor.selection = new Selection(target, target);
      editor.revealRange(
        new Selection(target, target),
        TextEditorRevealType.InCenterIfOutsideViewport
      );
    } catch (error) {
      logger.warn("Could not reveal the position of the statement error", {
        error,
      });
    }
  }
}

export const resultsPanel = new ResultsPanel();
