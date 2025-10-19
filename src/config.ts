import {
  type ConfigurationScope,
  WorkspaceConfiguration,
  type WorkspaceFolder,
  workspace,
} from "vscode";
import { logger } from "./logger";

/**
 * This function retrieves a setting from the workspace configuration.
 * Settings are looked up first under the "postgreslanguageserver", then under the "postgrestools" prefix.
 *
 * @param key The key of the setting to retrieve
 */
export const getFullConfig = (
  options: {
    scope?: ConfigurationScope;
  } = {}
): {
  postgrestools: WorkspaceConfiguration | undefined;
  postgresLanguageServer: WorkspaceConfiguration | undefined;
} => {
  return {
    postgrestools: workspace.getConfiguration("postgrestools", options.scope),
    postgresLanguageServer: workspace.getConfiguration(
      "postgres-language-server",
      options.scope
    ),
  };
};

/**
 * This function retrieves a setting from the workspace configuration.
 * Settings are looked up first under the "postgres-language-server", then under the "postgrestools" prefix.
 *
 * @param key The key of the setting to retrieve
 */
export const getConfig = <T>(
  key: string,
  options: {
    scope?: ConfigurationScope;
  } = {}
): T | undefined => {
  const newValue = workspace
    .getConfiguration("postgres-language-server", options.scope)
    .get<T>(key);

  logger.debug(`Setting '${key}' in new config: ${newValue}`);

  if (
    newValue !== undefined &&
    newValue !== "" &&
    newValue !== null &&
    typeof newValue !== "boolean"
  ) {
    return newValue;
  }

  const oldValue = workspace
    .getConfiguration("postgrestools", options.scope)
    .get<T>(key);

  logger.debug(`Setting '${key}' in old config: ${oldValue}`);

  return oldValue;
};

export const isEnabledForFolder = (folder: WorkspaceFolder): boolean => {
  return !!getConfig<boolean>("enabled", { scope: folder.uri });
};
