import {
  type CancellationToken,
  CancellationTokenSource,
  commands,
  ProgressLocation,
  window,
} from "vscode";
import {
  ExecuteCommandRequest,
  type ExecuteCommandSignature,
  type LanguageClient,
  LSPErrorCodes,
  ResponseError,
} from "vscode-languageclient/node";
import { logger } from "./logger";
import { resultsPanel } from "./results-panel";
import {
  EXECUTE_STATEMENT_COMMAND,
  parseExecuteStatementResult,
  statementFromArgument,
} from "./statement-result";

/** The context key that is set while a statement is executing. */
const RUNNING_CONTEXT_KEY = "postgres-language-server.statementExecutionRunning";

/** The cancellation sources of the statements that are executing. */
const running = new Set<CancellationTokenSource>();

/**
 * Cancels every statement that is executing. The language client sends
 * `$/cancelRequest` for each of their requests.
 */
export const cancelStatementExecutions = () => {
  if (running.size === 0) {
    window.showInformationMessage("No statement is executing.");
    return;
  }

  for (const source of running) {
    source.cancel();
  }
};

/**
 * Middleware for `workspace/executeCommand`. It lets every command through and
 * handles `pgls.executeStatement` itself, so that the request can be
 * cancelled and its result shown in the results panel.
 *
 * The server runs `pgls.executeStatement` when the user picks the "Execute
 * statement" code action. Its arguments are the statement and the URI of the
 * document.
 */
export const createExecuteCommandMiddleware =
  (getClient: () => LanguageClient | undefined) =>
  async (
    command: string,
    args: unknown[],
    next: ExecuteCommandSignature
  ): Promise<unknown> => {
    const client = getClient();
    if (command !== EXECUTE_STATEMENT_COMMAND || !client) {
      return next(command, args);
    }

    const source = new CancellationTokenSource();
    running.add(source);
    updateRunningContext();

    try {
      return await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: "Executing statement",
          cancellable: true,
        },
        (progress, progressToken) => {
          progressToken.onCancellationRequested(() => source.cancel());
          source.token.onCancellationRequested(() =>
            progress.report({ message: "Cancelling…" })
          );
          return executeStatement(client, args, source.token);
        }
      );
    } finally {
      running.delete(source);
      source.dispose();
      updateRunningContext();
    }
  };

const executeStatement = async (
  client: LanguageClient,
  args: unknown[],
  token: CancellationToken
): Promise<unknown> => {
  const statement = statementFromArgument(args[0]);
  const documentUri = typeof args[1] === "string" ? args[1] : undefined;
  const startedAt = Date.now();

  let value: unknown;
  try {
    // With the token, the client sends `$/cancelRequest` when it is cancelled.
    value = await client.sendRequest(
      ExecuteCommandRequest.type,
      { command: EXECUTE_STATEMENT_COMMAND, arguments: args },
      token
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    if (
      error instanceof ResponseError &&
      error.code === LSPErrorCodes.RequestCancelled
    ) {
      logger.info("Executing the statement was cancelled");
      resultsPanel.show(
        { kind: "cancelled", statement, durationMs },
        documentUri
      );
      return undefined;
    }

    logger.error("Executing the statement failed", { error });
    resultsPanel.show(
      {
        kind: "failure",
        statement,
        durationMs,
        message: error instanceof Error ? error.message : String(error),
      },
      documentUri
    );
    // Logs the error and notifies the user, like for any other failed request.
    client.error(`Request ${ExecuteCommandRequest.method} failed.`, error, true);
    return undefined;
  }

  const result = parseExecuteStatementResult(value);
  if (result) {
    resultsPanel.show(
      {
        kind: "result",
        statement,
        durationMs: Date.now() - startedAt,
        result,
        finishedDespiteCancellation: token.isCancellationRequested,
      },
      documentUri
    );
  } else {
    // Older servers only show a message and return nothing.
    logger.debug("The server returned no statement result", { value });
  }

  return value;
};

const updateRunningContext = () => {
  commands.executeCommand("setContext", RUNNING_CONTEXT_KEY, running.size > 0);
};
