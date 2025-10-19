import semver from "semver";
import { StrategyKind } from "./binary-finder";

export const EARLIEST_CROSS_PUBLISHING_RELEASE = "99.99.99";
export const LATEST_CROSS_PUBLISHING_RELEASE = "99.99.99";

export function shouldInformRename(
  installedVersion: string,
  latestAvailableVersion: string
) {
  return (
    semver.lte(installedVersion, LATEST_CROSS_PUBLISHING_RELEASE) &&
    semver.gte(latestAvailableVersion, EARLIEST_CROSS_PUBLISHING_RELEASE)
  );
}

export function updateAndRenamingMessageForKind(kind: StrategyKind): string {
  switch (kind) {
    case StrategyKind.NPM:
    case StrategyKind.Yarn:
      return "A new version of the Postgres Language Server is available! Make sure to use the new `@postgres-language-server/cli` package, as the old `@postgrestools/postgrestools` is being phased out.";
    case StrategyKind.Download:
    case StrategyKind.Path:
    case StrategyKind.VsCodeSettings:
      return "A new version of the Postgres Language Server is available! Make sure to get the binary from the new `postgres-language-server` name, as the old `postgrestools` is being phased out.";
    default:
      kind satisfies never;
      throw new Error("Unreachable");
  }
}

export function renamingMessageForKind(kind: StrategyKind): string {
  switch (kind) {
    case StrategyKind.NPM:
    case StrategyKind.Yarn:
      return "Warning: Please make sure to use the new `@postgres-language-server/cli` package, as the old `@postgrestools/postgrestools` is being phased out. If you've already switched, you're all set!";
    case StrategyKind.Download:
    case StrategyKind.Path:
    case StrategyKind.VsCodeSettings:
      return "Warning: Please make sure to use a binary from the new `postgres-language-server` package, as the old `postgrestools` is being phased out. If you've already switched, you're all set!";
    default:
      kind satisfies never;
      throw new Error("Unreachable");
  }
}
