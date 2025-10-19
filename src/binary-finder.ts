import { Uri } from "vscode";
import {
  BinaryFindStrategy,
  downloadPgltStrategy,
  nodeModulesStrategy,
  pathEnvironmentVariableStrategy,
  vsCodeSettingsStrategy,
  yarnPnpStrategy,
} from "./binary-finder-strategies";
import { logger } from "./logger";

type Strategy = {
  label: string;
  kind: StrategyKind;
  strategy: BinaryFindStrategy;
  onSuccess: (u: Uri) => void;
  condition?: (path?: Uri) => Promise<boolean>;
};

export enum StrategyKind {
  NPM,
  Yarn,
  VsCodeSettings,
  Path,
  Download,
}

const LOCAL_STRATEGIES: Strategy[] = [
  {
    label: "VSCode Settings",
    kind: StrategyKind.VsCodeSettings,
    strategy: vsCodeSettingsStrategy,
    onSuccess: (uri) =>
      logger.debug(
        `Found Binary in VSCode Settings (postgres-language-server.bin) or (postgrestools.bin)`,
        {
          path: uri.fsPath,
        }
      ),
  },
  {
    label: "NPM node_modules",
    kind: StrategyKind.NPM,
    strategy: nodeModulesStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found Binary in Node Modules`, {
        path: uri.fsPath,
      }),
  },
  {
    label: "Yarn Plug'n'Play node_modules",
    kind: StrategyKind.Yarn,
    strategy: yarnPnpStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found Binary in Yarn PnP`, {
        path: uri.fsPath,
      }),
  },
  {
    label: "PATH Environment Variable",
    kind: StrategyKind.Path,
    strategy: pathEnvironmentVariableStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found Binary in PATH Environment Variable`, {
        path: uri.fsPath,
      }),
  },
  {
    label: "Downloaded Binary",
    kind: StrategyKind.Download,
    strategy: downloadPgltStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found downloaded binary`, {
        path: uri.fsPath,
      }),
  },
];
const GLOBAL_STRATEGIES: Strategy[] = [
  {
    label: "VSCode Settings",
    kind: StrategyKind.VsCodeSettings,
    strategy: vsCodeSettingsStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found Binary in VSCode Settings`, {
        path: uri.fsPath,
      }),
  },
  {
    label: "PATH Environment Variable",
    kind: StrategyKind.Path,
    strategy: pathEnvironmentVariableStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found Binary in PATH Environment Variable`, {
        path: uri.fsPath,
      }),
  },
  {
    label: "Downloaded Binary",
    kind: StrategyKind.Download,
    strategy: downloadPgltStrategy,
    onSuccess: (uri) =>
      logger.debug(`Found downloaded binary`, {
        path: uri.fsPath,
      }),
  },
];

export class BinaryFinder {
  static async findGlobally() {
    logger.info("Using Global Strategies to find binary");
    const binary = await this.attemptFind(GLOBAL_STRATEGIES);

    if (!binary) {
      logger.debug("Unable to find binary globally.");
    }

    return binary;
  }

  static async findLocally(path: Uri) {
    logger.info("Using Local Strategies to find binary");
    const binary = await this.attemptFind(LOCAL_STRATEGIES, path);

    if (!binary) {
      logger.debug("Unable to find binary locally.");
    }

    return binary;
  }

  private static async attemptFind(strategies: Strategy[], path?: Uri) {
    for (const { strategy, onSuccess, condition, label, kind } of strategies) {
      if (condition && !(await condition(path))) {
        continue;
      }

      try {
        const binary = await strategy.find(path);
        if (binary) {
          onSuccess(binary);
          return { bin: binary, label, kind };
        } else {
          logger.info(`Binary not found with strategy`, {
            strategy: strategy.name,
          });
        }
      } catch (err: unknown) {
        logger.error(`${strategy.name} returned an error`, { err });
        continue;
      }
    }
  }
}
