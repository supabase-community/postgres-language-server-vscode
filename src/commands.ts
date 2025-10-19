import { Uri, window, workspace } from "vscode";
import { downloadPglt, getDownloadedBinary } from "./downloader";
import { restart, start, stop } from "./lifecycle";
import { logger } from "./logger";
import { state } from "./state";
import {
  clearGlobalBinaries,
  clearTemporaryBinaries,
  dirExists,
  getVersion,
} from "./utils";
import { Releases } from "./releases";
import { join } from "path";
import os from "node:os";

/**
 * These commands are exposed to the user via the Command Palette.
 */
export class UserFacingCommands {
  static async start() {
    await start();
  }

  static async stop() {
    await stop();
  }

  static async restart() {
    await restart();
  }

  /**
   * When calling this command, the user will be prompted to select a version of
   * the Postgres Language Server CLI to install. The selected version will be downloaded and stored
   * in VS Code's global storage directory.
   */
  static async download() {
    await downloadPglt();
  }

  /**
   * Stops and restarts the Postgres Language Server extension, resetting state and cleaning up temporary binaries.
   */
  static async reset() {
    await stop();
    await clearTemporaryBinaries();
    await clearGlobalBinaries();

    await Releases.refresh();

    await state.context.globalState.update("lastNotifiedOfUpdate", undefined);

    state.activeSession = undefined;
    state.activeProject = undefined;
    logger.info("Postgres Language Server extension was reset");

    await start();
  }

  static async currentVersion() {
    const session = state.activeSession;

    if (!session) {
      window.showInformationMessage(
        "No Postgres Language Server version installed."
      );
      return;
    }

    const version = await getVersion(session.bin);

    if (!version) {
      window.showInformationMessage(
        "No Postgres Language Server version installed."
      );
    } else {
      window.showInformationMessage(
        `Currently installed Postgres Language Server version is ${version}.`
      );
      window.showInformationMessage(
        `Using binary from "${session.binaryStrategyLabel}".`
      );
    }
  }

  static async copyLatestLogfile() {
    logger.info("Starting to copy latest log file…");

    let logdir;

    if (process.env.PGT_LOG_PATH) {
      logdir = Uri.file(process.env.PGT_LOG_PATH);
    } else {
      /*
       * Logs are placed at different locations based on the platform.
       * Linux: /home/alice/.cache/pgt
       * Win: C:\Users\Alice\AppData\Local\supabase-community\pgt\cache
       * Mac: /Users/Alice/Library/Caches/dev.supabase-community.pgt
       */
      switch (process.platform) {
        case "darwin": {
          logdir = Uri.file(
            join(
              os.homedir(),
              "Library",
              "Caches",
              "dev.supabase-community.pgt"
            )
          );
          break;
        }
        case "linux": {
          logdir = Uri.file(join(os.homedir(), ".cache", "pgt"));
          break;
        }
        case "win32": {
          logdir = Uri.file(
            join(
              os.homedir(),
              "AppData",
              "Local",
              "supabase-community",
              "pgt",
              "cache"
            )
          );
          break;
        }
        default: {
          window.showErrorMessage(
            `Unsupported Platform: ${process.platform}. Postgres Language Server only runs on linux, darwin and windows.`
          );
          return;
        }
      }
    }

    logger.info("Determined log directory location", {
      logdir: logdir.fsPath,
    });

    if (!(await dirExists(logdir))) {
      window.showErrorMessage(`Did not find expected log directory.`);
      return;
    }

    const logFiles = await workspace.fs
      .readDirectory(logdir)
      .then((files) => files.filter(([name]) => name.startsWith("server.log")));

    if (logFiles.length === 0) {
      window.showErrorMessage(`No log files found in log directory.`);
      return;
    }

    logger.info(`Found ${logFiles.length} log files.`);

    if (!state.activeProject) {
      window.showErrorMessage(
        `No active project, can't determine a location to copy the log file.`
      );
      return;
    }

    logFiles.sort((a, b) => {
      const [dateA, idxA] = getDatePartsFromLogFile(a[0]);
      const [dateB, idxB] = getDatePartsFromLogFile(b[0]);

      if (dateA.getTime() === dateB.getTime()) {
        return idxB - idxA;
      } else {
        return dateB.getTime() - dateA.getTime();
      }
    });

    const [latestFilename] = logFiles[0];

    logger.info(`Identified latest log file.`, {
      filename: latestFilename,
    });

    try {
      const target = Uri.joinPath(state.activeProject.path, "server.log");

      await workspace.fs.copy(Uri.joinPath(logdir, latestFilename), target);

      window.showInformationMessage(`Copied log file to ${target.fsPath}.`);
    } catch (err) {
      logger.error(`Error copying log file: ${err}`);
      window.showErrorMessage(
        `Error copying log file. View Output for more information.`
      );
    }
  }
}

/** Expected format is server.log.2025-01-01-17 */
function getDatePartsFromLogFile(filename: string): [Date, number] {
  try {
    const last = filename.split(".").pop()!;
    const [year, month, day, idx] = last.split("-");

    if (!year || !month || !day || !idx || Number.isNaN(+idx)) {
      throw new Error();
    }

    return [new Date(`${year}-${month}-${day}`), +idx];
  } catch {
    logger.warn(`Unexpected log file name: ${filename}`);
    return [new Date(0), 999];
  }
}
