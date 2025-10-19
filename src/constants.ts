import { workspace } from "vscode";
import packageJson from "../package.json";

export enum OperatingMode {
  SingleFile = "single_file", // unsupported
  SingleRoot = "single_root",
  MultiRoot = "multi_root",
}

const newPackageName = "@postgres-language-server/cli";
const oldPackageName = "@postgrestools/postgrestools";

/**
 * platform and arch are values injected into the node runtime.
 * We use the values documented on https://nodejs.org.
 */
const OLD_PACKAGE_NAMES: Record<string, Record<string, string>> = {
  win32: {
    x64: `@postgrestools/cli-x86_64-windows-msvc`,
    arm64: `@postgrestools/cli-aarch64-windows-msvc`,
  },
  darwin: {
    x64: `@postgrestools/cli-x86_64-apple-darwin`,
    arm64: `@postgrestools/cli-aarch64-apple-darwin`,
  },
  linux: {
    x64: `@postgrestools/cli-x86_64-linux-gnu`,
    arm64: `@postgrestools/cli-aarch64-linux-gnu`,
  },
};
const NEW_PACKAGE_NAMES: Record<string, Record<string, string>> = {
  win32: {
    x64: `@postgres-language-server/cli-x86_64-windows-msvc`,
    arm64: `@postgres-language-server/cli-aarch64-windows-msvc`,
  },
  darwin: {
    x64: `@postgres-language-server/cli-x86_64-apple-darwin`,
    arm64: `@postgres-language-server/cli-aarch64-apple-darwin`,
  },
  linux: {
    x64: `@postgres-language-server/cli-x86_64-linux-gnu`,
    arm64: `@postgres-language-server/cli-aarch64-linux-gnu`,
  },
};

const platformMappings: Record<string, string> = {
  darwin: "apple-darwin",
  linux: "unknown-linux-gnu",
  win32: "pc-windows-msvc",
};

const archMappings: Record<string, string> = {
  arm64: "aarch64",
  x64: "x86_64",
};

const _CONSTANTS = {
  displayName: packageJson.name,

  activationTimestamp: Date.now(),

  oldPlatformSpecificBinaryName: (() => {
    return `postgrestools${process.platform === "win32" ? ".exe" : ""}`;
  })(),
  newPlatformSpecificBinaryName: (() => {
    return `postgres-language-server${
      process.platform === "win32" ? ".exe" : ""
    }`;
  })(),

  /**
   * The name under which Postgres Language Server is published on npm.
   */
  oldPackageName,
  newPackageName,

  oldPlatformSpecificNodePackageName: (() => {
    const platform: string = process.platform;
    const arch: string = process.arch;

    const pkg = OLD_PACKAGE_NAMES[platform]?.[arch];

    // TS won't pick up on the possibility of this being undefined
    return pkg as string | undefined;
  })(),
  newPlatformSpecificNodePackageName: (() => {
    const platform: string = process.platform;
    const arch: string = process.arch;

    const pkg = NEW_PACKAGE_NAMES[platform]?.[arch];

    // TS won't pick up on the possibility of this being undefined
    return pkg as string | undefined;
  })(),

  oldPlatformSpecificReleasedAssetName: (() => {
    let assetName = "postgrestools";

    for (const [nodeArch, rustArch] of Object.entries(archMappings)) {
      if (nodeArch === process.arch) {
        assetName += `_${rustArch}`;
      }
    }

    for (const [nodePlatform, rustPlatform] of Object.entries(
      platformMappings
    )) {
      if (nodePlatform === process.platform) {
        assetName += `-${rustPlatform}`;
      }
    }

    return assetName;
  })(),

  newPlatformSpecificReleasedAssetName: (() => {
    let assetName = "postgres-language-server";

    for (const [nodeArch, rustArch] of Object.entries(archMappings)) {
      if (nodeArch === process.arch) {
        assetName += `_${rustArch}`;
      }
    }

    for (const [nodePlatform, rustPlatform] of Object.entries(
      platformMappings
    )) {
      if (nodePlatform === process.platform) {
        assetName += `-${rustPlatform}`;
      }
    }

    return assetName;
  })(),

  currentMachineSupported: (() => {
    // In future release, we should also check whether the toolchain matches (Linux musl, GNU etc.)
    return !!(platformMappings[process.platform] && archMappings[process.arch]);
  })(),

  operatingMode: ((): OperatingMode => {
    if (workspace.workspaceFolders === undefined) {
      return OperatingMode.SingleFile;
    }

    if (workspace.workspaceFolders.length > 1) {
      return OperatingMode.MultiRoot;
    }

    return OperatingMode.SingleRoot;
  })(),

  platformIdentifier: (() => {
    return `${process.platform}-${process.arch}`;
  })(),

  globalStorageFolderForBinary: "global-bin",
  globalStorageFolderTmp: "tmp-bin",
};

export const CONSTANTS: typeof _CONSTANTS = new Proxy(_CONSTANTS, {
  get(target, prop, receiver) {
    return Reflect.get(target, prop, receiver);
  },
  set: () => true,
  deleteProperty: () => true,
});
