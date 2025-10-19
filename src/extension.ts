import {
  type ConfigurationChangeEvent,
  commands,
  window,
  workspace,
} from "vscode";
import { UserFacingCommands } from "./commands";
import { restart, start, stop } from "./lifecycle";
import { logger } from "./logger";
import { state } from "./state";
import { debounce } from "./utils";
import { updateHidden } from "./status-bar";

/**
 * This function is responsible for booting the Postgres Language Server extension. It is called
 * when the extension is activated.
 */
export const createExtension = async () => {
  registerUserFacingCommands();
  await start();
  listenForConfigurationChanges();
  listenForActiveTextEditorChange();
};

/**
 * This function is responsible for shutting down the Postgres Language Server extension. It is
 * called when the extension is deactivated and will trigger a cleanup of the
 * extension's state and resources.
 */
export const destroyExtension = async () => {
  await stop();
};

const registerUserFacingCommands = () => {
  state.context.subscriptions.push(
    commands.registerCommand(
      "postgres-language-server.start",
      UserFacingCommands.start
    ),
    commands.registerCommand(
      "postgres-language-server.stop",
      UserFacingCommands.stop
    ),
    commands.registerCommand(
      "postgres-language-server.restart",
      UserFacingCommands.restart
    ),
    commands.registerCommand(
      "postgres-language-server.download",
      UserFacingCommands.download
    ),
    commands.registerCommand(
      "postgres-language-server.reset",
      UserFacingCommands.reset
    ),
    commands.registerCommand(
      "postgres-language-server.currentVersion",
      UserFacingCommands.currentVersion
    ),
    commands.registerCommand(
      "postgres-language-server.copyLatestLogfile",
      UserFacingCommands.copyLatestLogfile
    )
  );

  // deprecated
  state.context.subscriptions.push(
    commands.registerCommand("postgrestools.start", UserFacingCommands.start),
    commands.registerCommand("postgrestools.stop", UserFacingCommands.stop),
    commands.registerCommand(
      "postgrestools.restart",
      UserFacingCommands.restart
    ),
    commands.registerCommand(
      "postgrestools.download",
      UserFacingCommands.download
    ),
    commands.registerCommand("postgrestools.reset", UserFacingCommands.reset),
    commands.registerCommand(
      "postgrestools.currentVersion",
      UserFacingCommands.currentVersion
    ),
    commands.registerCommand(
      "postgrestools.copyLatestLogfile",
      UserFacingCommands.copyLatestLogfile
    )
  );

  logger.info("User-facing commands registered");
};

/**
 * This function sets up a listener for configuration changes in the `postgres-language-server`
 * or `postgrestools` namespace. When a configuration change is detected, the extension is
 * restarted to reflect the new configuration.
 */
const listenForConfigurationChanges = () => {
  const debouncedConfigurationChangeHandler = debounce(
    (event: ConfigurationChangeEvent) => {
      if (event.affectsConfiguration("postgres-language-server")) {
        logger.info("Configuration change detected.");
        if (!["restarting", "stopping"].includes(state.state)) {
          restart();
        }
      } else if (event.affectsConfiguration("postgrestools")) {
        logger.info("Configuration change detected.");
        if (!["restarting", "stopping"].includes(state.state)) {
          restart();
        }
      }
    }
  );

  state.context.subscriptions.push(
    workspace.onDidChangeConfiguration(debouncedConfigurationChangeHandler)
  );

  logger.info("Started listening for configuration changes");
};

/**
 * This function listens for changes to the active text editor and updates the
 * active project accordingly. This change is then reflected throughout the
 * extension automatically. Notably, this triggers the status bar to update
 * with the active project.
 */
const listenForActiveTextEditorChange = () => {
  state.context.subscriptions.push(
    window.onDidChangeActiveTextEditor(async () => {
      const editor = window.activeTextEditor;
      logger.debug(`User changed active text editor.`);

      updateHidden(editor);

      const documentUri = editor?.document.uri;
      if (!documentUri) {
        logger.debug(
          `User changed active text editor, but document uri could not be found.`
        );
        return;
      }

      const folder = workspace.getWorkspaceFolder(documentUri);
      if (!folder) {
        logger.debug(
          `User changed active text editor, but matching workspace folder could not be found.`,
          { uri: documentUri }
        );
        return;
      }

      const matchingProject = state.allProjects?.get(folder.uri);
      if (!matchingProject) {
        logger.debug(
          `User changed active text editor, but matching project could not be found.`,
          { uri: folder.uri, projects: state.allProjects }
        );
        return;
      }

      logger.debug(`Found matching active project.`, {
        project: matchingProject.path,
      });
      state.activeProject = matchingProject;
    })
  );

  logger.info("Started listening for active text editor changes");

  updateHidden(window.activeTextEditor);
};
