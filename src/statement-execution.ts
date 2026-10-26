import type { ExecuteCommandSignature } from "vscode-languageclient/node";
import { logger } from "./logger";
import { resultsPanel } from "./results-panel";
import {
  EXECUTE_STATEMENT_COMMAND,
  parseExecuteStatementResult,
  statementFromArgument,
} from "./statement-result";

/**
 * Middleware for `workspace/executeCommand`. It lets every command through and
 * shows the result of `pgls.executeStatement` in the results panel.
 *
 * The server runs `pgls.executeStatement` when the user picks the "Execute
 * statement" code action. Its arguments are the statement and the URI of the
 * document.
 */
export const executeCommand = async (
  command: string,
  args: unknown[],
  next: ExecuteCommandSignature
): Promise<unknown> => {
  if (command !== EXECUTE_STATEMENT_COMMAND) {
    return next(command, args);
  }

  const statement = statementFromArgument(args[0]);
  const documentUri = typeof args[1] === "string" ? args[1] : undefined;
  const startedAt = Date.now();

  let value: unknown;
  try {
    value = await next(command, args);
  } catch (error) {
    // The language client already logged the failed request and notified the user.
    logger.error("Executing the statement failed", { error });
    resultsPanel.show(
      {
        kind: "failure",
        statement,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      },
      documentUri
    );
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
      },
      documentUri
    );
  } else {
    // Older servers only show a message and return nothing.
    logger.debug("The server returned no statement result", { value });
  }

  return value;
};
