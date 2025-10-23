import semver from "semver";
import { StrategyKind } from "./binary-finder";
import { CONSTANTS } from "./constants";

export async function hasNewName() {
  try {
    const response = await fetch(
      `https://github.com/supabase-community/postgres-language-server/releases/latest/download/${CONSTANTS.newPlatformSpecificReleasedAssetName}`,
      {
        method: "HEAD",
      }
    );
    return response.ok;
  } catch {
    return false;
  }
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
