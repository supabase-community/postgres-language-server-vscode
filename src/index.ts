// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { logger } from "./logger";
import { state } from "./state";
import { createExtension, destroyExtension } from "./extension";
import { getConfig, getFullConfig } from "./config";
import { CONSTANTS } from "./constants";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  logger.clear();
  logger.info(
    `Postgres Language Server extension ${context.extension.packageJSON.version} activated`
  );
  state.context = context;

  const config = getFullConfig();

  logger.info(`Starting with config…`, { config });
  logger.info(`In mode…`, { mode: CONSTANTS.operatingMode });

  await createExtension();
}

// This method is called when your extension is deactivated
export async function deactivate() {
  await destroyExtension();
}
