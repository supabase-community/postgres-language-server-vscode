import { Uri, window, type WorkspaceFolder } from "vscode";
import { fileExists } from "./utils";
import { getConfig, isEnabledForFolder } from "./config";
import { logger } from "./logger";
import { state } from "./state";

export type Project = {
  folder?: WorkspaceFolder;
  path: Uri;
  configPath?: Uri;
};

export async function getActiveProjectsForMultiRoot(
  folders: readonly WorkspaceFolder[]
): Promise<Project[]> {
  let globalConfig: Uri | undefined = undefined;

  if (!globalConfig) {
    const globalConfigSetting = getConfig<string>("configFile");

    if (globalConfigSetting && globalConfigSetting.startsWith(".")) {
      window.showErrorMessage(
        "Relative paths to the `postgres-language-server.jsonc` or `postgrestools.jsonc` file in a multi-root workspace are not supported. Please use an absolute path in your `*.code-workspace` file."
      );
      return [];
    }

    if (globalConfigSetting) {
      globalConfig = Uri.file(globalConfigSetting);
    }
  }

  if (globalConfig && !(await fileExists(globalConfig))) {
    window.showErrorMessage(
      `Unable to find config file at path:\n${globalConfig.fsPath}`
    );
    await state.context.workspaceState.update("workspaceConfigFile", undefined);
    return [];
  }

  return await Promise.all(
    folders.map(async (folder) => {
      if (!isEnabledForFolder(folder)) {
        logger.info(
          `Postgres Language Server disabled for folder via settings`,
          {
            path: folder.uri,
          }
        );

        return null;
      }

      if (!globalConfig) {
        const defaultConfigPathNew = Uri.joinPath(
          folder.uri,
          "postgres-language-server.jsonc"
        );
        const defaultConfigPathOld = Uri.joinPath(
          folder.uri,
          "postgrestools.jsonc"
        );

        const hasDefaultConfig =
          (await fileExists(defaultConfigPathNew)) ||
          (await fileExists(defaultConfigPathOld));

        if (!hasDefaultConfig) {
          logger.info(
            `Project does not have a config file at default path and is therefore excluded from multi-root workspace.`,
            {
              path: folder.uri,
            }
          );
          return null;
        }
      }

      return {
        folder,
        path: folder.uri,
        configPath: globalConfig,
      };
    })
  ).then((results) => results.filter((it) => !!it));
}

export async function getActiveProjectForSingleRoot(
  first: WorkspaceFolder
): Promise<Project | null> {
  let configPath: Uri;

  const userConfig = getConfig<string>("configFile", { scope: first.uri });
  if (userConfig) {
    logger.info("User has specified path to config file.", {
      path: userConfig,
    });
    configPath = Uri.joinPath(first.uri, userConfig);
  } else {
    logger.info("User did not specify path to config file. Using default.");

    const newDefault = Uri.joinPath(
      first.uri,
      "postgres-language-server.jsonc"
    );

    const oldDefault = Uri.joinPath(first.uri, "postgrestools.jsonc");

    configPath = (await fileExists(newDefault)) ? newDefault : oldDefault;
  }

  if (!(await fileExists(configPath))) {
    logger.info("Config file does not exist.", {
      path: configPath.fsPath,
    });
    return null;
  } else {
    logger.info("Found config file.", {
      path: configPath.fsPath,
    });
  }

  return {
    folder: first,
    path: first.uri,
    configPath,
  };
}
