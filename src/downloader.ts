import * as semver from "semver";
import {
  ProgressLocation,
  QuickPickItem,
  Uri,
  window,
  workspace,
} from "vscode";
import { logger } from "./logger";
import { state } from "./state";
import { CONSTANTS } from "./constants";
import { fileExists, getVersion } from "./utils";
import { chmodSync } from "fs";
import { hasNewName } from "./renaming";

export async function downloadPglt(): Promise<Uri | null> {
  logger.debug(`Downloading Postgres Language Server`);

  const versionToDownload = await promptVersionToDownload();

  if (!versionToDownload) {
    logger.debug(`No version to download selected, aborting`);
    return null;
  }

  await window.withProgress(
    {
      title: `Downloading Postgres Language Server ${versionToDownload.label}`,
      location: ProgressLocation.Notification,
    },
    () => downloadPgltVersion(versionToDownload.label)
  );

  const downloaded = await getDownloadedBinary();

  return downloaded?.binPath ?? null;
}

async function downloadPgltVersion(version: string): Promise<void> {
  const newNameAvailable = await hasNewName();

  const url = newNameAvailable
    ? `https://github.com/supabase-community/postgres-language-server/releases/download/${version}/${CONSTANTS.newPlatformSpecificReleasedAssetName}`
    : `https://github.com/supabase-community/postgres-language-server/releases/download/${version}/${CONSTANTS.oldPlatformSpecificReleasedAssetName}`;

  logger.debug(`Attempting to download binary asset from Github`, { url });

  let binary: ArrayBuffer;

  try {
    binary = await fetch(url, {
      headers: {
        Accept: "application/octet-stream",
      },
    })
      .then((r) => r.blob())
      .then((b) => b.arrayBuffer());
  } catch (error: unknown) {
    logger.error(`Failed to download binary`, { error });
    window.showErrorMessage(
      `Failed to download binary version ${version} from ${url}.\n\n${error}`
    );
    return;
  }

  const binPath = newNameAvailable
    ? getNewInstalledBinaryPath()
    : getOldInstalledBinaryPath();

  try {
    await workspace.fs.writeFile(binPath, new Uint8Array(binary));
    chmodSync(binPath.fsPath, 0o755);
    const successMsg = `Downloaded Postgres Language Server ${version} to ${binPath.fsPath}`;
    logger.info(successMsg);
    window.showInformationMessage(successMsg);
  } catch (error) {
    logger.error(`Failed to save downloaded binary`, { error });
    window.showErrorMessage(`Failed to save binary.\n\n${error}`);
    return;
  }
}

export async function getDownloadedBinary(): Promise<{
  version: string;
  binPath: Uri;
} | null> {
  logger.debug(`Getting downloaded version`);

  for (const bin of [
    getNewInstalledBinaryPath(),
    getOldInstalledBinaryPath(),
  ]) {
    if (await fileExists(bin)) {
      const version = await getVersion(bin);
      if (!version) {
        throw new Error("Just verified file exists, but it doesn't anymore.");
      }

      logger.debug(`Found downloaded version and binary`, {
        path: bin.fsPath,
        version,
      });

      return {
        binPath: bin,
        version,
      };
    } else {
      logger.info(`Downloaded binary does not exist:`, { binPath: bin });
    }
  }

  return null;
}

async function promptVersionToDownload() {
  logger.debug(
    `Prompting user to select Postgres Language Server version to download`
  );

  const itemsPromise: Promise<QuickPickItem[]> = new Promise(
    async (resolve) => {
      const downloadedBinary = await getDownloadedBinary()
        .then((it) => it?.version)
        .catch(() => undefined);

      logger.debug(`Retrieved downloaded version`, {
        downloadedVersion: downloadedBinary,
      });

      const availableVersions = state.releases.all();

      const items: QuickPickItem[] = availableVersions.map((release, index) => {
        const descriptions = [];

        if (index === 0) {
          descriptions.push("latest");
        }

        if (release.prerelease) {
          descriptions.push("prerelease");
        }

        if (downloadedBinary === release.tag_name) {
          descriptions.push("(currently installed)");
        }

        return {
          label: release.tag_name,
          description: descriptions.join(", "),
          alwaysShow: index < 3,
        };
      });

      resolve(items);
    }
  );

  return window.showQuickPick(itemsPromise, {
    title: "Select Postgres Language Server version to download",
    placeHolder: "Select Postgres Language Server version to download",
  });
}

function getOldInstalledBinaryPath() {
  return Uri.joinPath(
    state.context.globalStorageUri,
    CONSTANTS.globalStorageFolderForBinary,
    CONSTANTS.oldPlatformSpecificBinaryName
  );
}

function getNewInstalledBinaryPath() {
  return Uri.joinPath(
    state.context.globalStorageUri,
    CONSTANTS.globalStorageFolderForBinary,
    CONSTANTS.newPlatformSpecificBinaryName
  );
}
