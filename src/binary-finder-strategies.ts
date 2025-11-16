import { Uri, window } from "vscode";
import { logger } from "./logger";
import { delimiter, dirname, join } from "node:path";
import { CONSTANTS, OperatingMode } from "./constants";
import { fileExists } from "./utils";
import { createRequire } from "node:module";
import { getConfig } from "./config";
import { downloadPglt, getDownloadedBinary } from "./downloader";

export interface BinaryFindStrategy {
  name: string;
  find(path?: Uri): Promise<Uri | null>;
}

/**
 * The user can specify a Postgres Language Server binary in the VSCode settings.
 *
 * This can be done in two ways:
 *
 * 1. A static string that points to a binary. The extension will try to retrieve the binary from there.
 *
 * 2. An object with OS & arch combinations as keys and binary paths as values.
 * The extension will try to retrieve the binary from the key matching the current OS and arch.
 *
 * Config Example:
 * ```json
 * {
 *   "postgreslanguageserver.bin": {
 *   	"linux-x64": "/path/to/bin",
 *    "darwin-arm64": "/path/to/bin",
 *    "win32-x64": "/path/to/bin.exe"
 *   }
 * }
 */
export const vsCodeSettingsStrategy: BinaryFindStrategy = {
  name: "VSCode Settings Strategy",
  async find(path?: Uri) {
    logger.debug(
      "Trying to find Postgres Language Server binary via VSCode Settings"
    );

    type BinSetting = string | Record<string, string> | undefined;
    let binSetting: BinSetting = getConfig("bin", {
      scope: path,
    });

    if (!binSetting) {
      logger.debug("Binary path not set in VSCode Settings");
      return null;
    }

    if (typeof binSetting === "object") {
      logger.debug(
        "Binary Setting is an object, extracting relevant platform",
        { binSetting }
      );

      const relevantSetting = binSetting[CONSTANTS.platformIdentifier];
      if (relevantSetting) {
        logger.debug(
          "Found matching setting for platform in VSCode Settings, assigning as string",
          {
            setting: relevantSetting,
            platformIdentifier: CONSTANTS.platformIdentifier,
          }
        );
        binSetting = relevantSetting;
      }
    }

    if (typeof binSetting === "string") {
      logger.debug("Binary Setting is a string", { binSetting });

      let resolvedPath: string;

      if (binSetting.startsWith(".")) {
        if (CONSTANTS.operatingMode === OperatingMode.MultiRoot) {
          window.showErrorMessage(
            "Relative paths for the postgres language server binary in a multi-root workspace setting are not supported. Please use an absolute path in your `*.code-workspace` file."
          );
          return null;
        } else if (path) {
          resolvedPath = Uri.joinPath(path, binSetting).fsPath;
        } else {
          // can't really happen.
          logger.error(
            `User picked a relative path for setting and is not in multi-root workspace mode. Somehow, we couldn't form a path to the binary.`
          );
          return null;
        }
      } else {
        resolvedPath = binSetting;
      }

      if (!resolvedPath) {
        return null;
      }

      logger.debug("Looking for binary at path", { resolvedPath });

      const bin = Uri.file(resolvedPath);

      if (await fileExists(bin)) {
        return bin;
      }
    }

    logger.debug(
      "No Postgres Language Server binary found in VSCode settings."
    );

    return null;
  },
};

/**
 * Task:
 * Search the binary in node modules.
 * Search for the sub-packages that the binary tries to use with npm.
 * Use node's `createRequire` – what's that?
 * Resolve the *main* package.json – the one used by @postgres-language-server/cli or `@postgrestools/postgrestools`.
 * In those node_modules, you should see the installed optional dependency.
 */
export const nodeModulesStrategy: BinaryFindStrategy = {
  name: "Node Modules Strategy",
  async find(path?: Uri) {
    logger.debug(
      "Trying to find Postgres Language Server binary in Node Modules"
    );

    if (!path) {
      logger.debug("No local path, skipping.");
      return null;
    }

    for (const [pkgname, nodePkgName, binaryName] of [
      [
        CONSTANTS.newPackageName,
        CONSTANTS.newPlatformSpecificNodePackageName,
        CONSTANTS.newPlatformSpecificBinaryName,
      ],
      [
        CONSTANTS.oldPackageName,
        CONSTANTS.oldPlatformSpecificNodePackageName,
        CONSTANTS.oldPlatformSpecificBinaryName,
      ],
    ] satisfies [string, string | undefined, string][]) {
      const postgresLanguageServerPackageNameJson = `${pkgname}/package.json`;

      logger.info(`Searching for node_modules package`, {
        postgresLanguageServerPackageNameJson,
      });

      let requirePgltPackage: NodeJS.Require;
      try {
        /**
         * Create a scoped require function that can require modules from the
         * package installed via npm.
         *
         * We're essentially searching for the installed package in the current dir, and requiring from its node_modules.
         * `package.json` serves as a target to resolve the root of the package.
         */
        requirePgltPackage = createRequire(
          require.resolve(postgresLanguageServerPackageNameJson, {
            paths: [path.fsPath], // note: global ~/.node_modules is always searched
          })
        );
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.toLowerCase().includes("cannot find module")
        ) {
          logger.debug(`User does not have the package installed`);
          continue;
        } else {
          throw err;
        }
      }

      logger.debug("Created require function!");

      if (nodePkgName === undefined) {
        logger.debug(
          `No package for current platform available in node_modules`,
          {
            os: process.platform,
            arch: process.arch,
          }
        );
        return null;
      }

      logger.debug(
        `Resolving bin package at nested ${nodePkgName}/package.json`
      );

      const binPackage = dirname(
        requirePgltPackage.resolve(`${nodePkgName}/package.json`)
      );

      logger.debug(`Resolved binpackage`, { binPackage });

      const binPath = join(binPackage, binaryName);
      const bin = Uri.file(binPath);

      if (await fileExists(bin)) {
        return bin;
      }
      logger.debug(
        `Unable to find Postgres Language Server in path ${binPath}`
      );
    }

    return null;
  },
};

export const yarnPnpStrategy: BinaryFindStrategy = {
  name: "Yarn PnP Strategy",
  async find(path?: Uri) {
    logger.debug(
      "Trying to find Postgres Language Server binary in Yarn Plug'n'Play"
    );

    if (!path) {
      logger.debug("No local path, skipping.");
      return null;
    }

    for (const ext of ["cjs", "js"]) {
      const pnpFile = Uri.joinPath(path, `.pnp.${ext}`);

      if (!(await fileExists(pnpFile))) {
        logger.debug(`Couldn't find Plug'n'Play file with ext '${ext}'`);
        continue;
      }

      /**
       * Load the pnp file, so we can use the exported
       * `resolveRequest` method.
       *
       * `resolveRequest(request, issuer)` takes a request for a dependency and an issuer
       * that depends on said dependency.
       */
      const yarnPnpApi = require(pnpFile.fsPath);

      /**
       * Issue a request to the Postgres Language Server package.json from the current dir.
       */
      for (const [pkgname, nodePkgName, binaryName] of [
        [
          CONSTANTS.newPackageName,
          CONSTANTS.newPlatformSpecificNodePackageName,
          CONSTANTS.newPlatformSpecificBinaryName,
        ],
        [
          CONSTANTS.oldPackageName,
          CONSTANTS.oldPlatformSpecificNodePackageName,
          CONSTANTS.oldPlatformSpecificBinaryName,
        ],
      ]) {
        if (nodePkgName === undefined) {
          logger.debug(
            `No node package for current platform available in yarn pnp`,
            {
              os: process.platform,
              arch: process.arch,
            }
          );
          continue;
        }

        // yarn api will throw if we require a pkg that is not listed in package.json
        try {
          const packageJson = yarnPnpApi.resolveRequest(
            `${pkgname}/package.json`,
            path.fsPath
          );

          /**
           * Return URI to the platform-specific binary that the found main package depends on.
           */
          return Uri.file(
            yarnPnpApi.resolveRequest(
              `${nodePkgName}/${binaryName}`,
              packageJson
            )
          );
        } catch {
          logger.debug(
            `Unable to find package ${pkgname} via Yarn Plug'n'Play API`
          );
          continue;
        }
      }
    }

    logger.debug(
      "Couldn't find Postgres Language Server binary via Yarn Plug'n'Play"
    );

    return null;
  },
};

export const pathEnvironmentVariableStrategy: BinaryFindStrategy = {
  name: "PATH Env Var Strategy",
  async find() {
    const pathEnv = process.env.PATH;

    logger.debug(
      "Trying to find Postgres Language Server binary in PATH env var"
    );

    if (!pathEnv) {
      logger.debug("Path env var not found");
      return null;
    }

    for (const dir of pathEnv.split(delimiter)) {
      logger.debug(`Checking ${dir}`);

      for (const bname of [
        CONSTANTS.newPlatformSpecificBinaryName,
        CONSTANTS.oldPlatformSpecificBinaryName,
      ]) {
        const bin = Uri.joinPath(Uri.file(dir), bname);

        if (await fileExists(bin)) {
          return bin;
        }
      }
    }

    logger.debug("Couldn't determine binary in PATH env var");

    return null;
  },
};

export const downloadPgltStrategy: BinaryFindStrategy = {
  name: "Download Postgres Language Server Strategy",
  async find() {
    logger.debug(`Trying to find downloaded Postgres Language Server binary`);

    const downloadedBinary = await getDownloadedBinary();

    if (downloadedBinary) {
      logger.info(
        `Using previously downloaded version ${downloadedBinary.version} at ${downloadedBinary.binPath.fsPath}`
      );

      return downloadedBinary.binPath;
    }

    const proceed =
      (await window.showInformationMessage(
        "You've opened a supported file outside of a Postgres Language Server project, and no installed Postgres Language Server binary could be found on your system. Would you like to download and install Postgres Language Server?",
        "Download and install",
        "No"
      )) === "Download and install";

    if (!proceed) {
      logger.debug(`Decided not to download binary, aborting`);
      return null;
    }

    return await downloadPglt();
  },
};
