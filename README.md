# Postgres Language Server Extension for VS Code

The **Postgres Language Server extension for Visual Studio Code** brings PostgreSQL inline suggestions, linting, and type checks to VSCode and VSCode-based editors.

It does so by implementing an LSP client and launching an LSP Server in the background.

## What's an LSP?

The [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) is a protocol defined by Microsoft. Its goal is to standardize language features across many editors. If you use a modern IDE and you've ever used autocompletion or linting, you've used an LSP. The server is aware of the files you have opened and analyzes them in the background. The client sends requests for e.g. autocompletions or code actions to the server.

## Setting Up the LSP Server

**First**, you need the LSP server binary. The [Postgres language server](https://github.com/supabase-community/postgres-language-server) is written in Rust and is therefore compiled to various binaries for various machines. You can set it up via one of five strategies. The extensions will check them in the following order:

- The `postgres-language-server.bin` VSCode setting can point to a binary with relative or absolute paths. You can use this if you want to download a specific binary from one of the [Postgres language server](https://github.com/supabase-community/postgres-language-server) releases and place it in your project.
- **Recommended**: If you use node, you can simply run `npm i -D @postgres-language-server/cli@latest`. Once you restart the extension, it should look for the server binary in your `node_modules`.
- If you use node but you install your packages via Yarn Plug'n'Play, you can still install `@postgres-language-server/cli`, and the extension will check your `.pnp.cjs` file for a binary.
- You can install the LSP server globally (e.g. via `brew` or by downloading a binary from the GitHub releases). Make sure that its binary is exposed in your $PATH – the extension will search it for a `postgres-language-server` on Darwin/Linux or a `postgres-language-server.exe` on Windows.
- If no LSP server binary can be found via the above strategies, you will be prompted to download a binary from the Postgres language server's GitHub Releases. You can also do this later via the [Download Server Command](#useful-commands). Note that the above strategies will still take precedence.
  The found binary is copied to a temporary location in your VS Code extensions folder and run from there. When you restart the extension, the copied binary will be used, and the above places won't be searched.

## Setting Up Your Project

**Second**, you need a `postgres-language-server.jsonc` file at the root of your repository (or, use a custom file location and point to it via the `postgres-language-server.configFile` setting). You can find sane defaults in the [docs](https://pgtools.dev/#configuration).

When you specify the `db` section, the LSP server will connect to your database and gather intel from there. This makes it possible to provide autocompletions and type checks.

If you omit the section, on the other hand, those features won't be enabled, and you'll only get linting.

## Verify It Works

To verify that the server is installed and running correctly, you can use the "Get Current Version" command listed in [Useful Commands](#useful-commands).

To verify that the client works as intended, open a `.sql` file and write some gibberish – you should get red squiggly lines from `pg(syntax)`.

## Working With Supabase

The Postgres language server is not custom-tailored to work with Supabase – it works with any Postgres database.

If you do use Supabase, you can get the most of the LSP by using it against your local Supabase database (Here's how to [install the Supabase CLI](https://supabase.com/docs/guides/local-development)).

Once you have [everything running locally](https://supabase.com/docs/guides/local-development/cli/getting-started), run `supabase status` to see your local `DB URL`.

It'll have the following format: `postgresql://<username>:<password>@<host>:<port>/<database>`.

If you extract the values, add them to your `postgres-language-server.jsonc` file, and restart the extension, you should be ready to go.

You can also run the LSP server against your remote database, but this might lead to small latencies and a small performance overhead (the LSP server runs `prepare` statements against your database for the type checking).

You should find your remote database settings at `https://supabase.com/dashboard/project/<yourProjectId>/settings/database?showConnect=true`.

## Useful Commands

The extension adds seven commands to your VS Code Command Palette. They are all prefixed by `Postgres Language Server`.

- `Postgres Language Server: Hard Reset (Delete All Temp and Global Binaries)` is your troubleshooting weapon. It will basically remove all binaries that were copied and downloaded _by the extension_ (not those you have installed or copied yourself). The extension will then again search for a server binary via the strategies mentioned in [the setup](#setting-up-the-lsp-server).
- `Postgres Language Server: Download Server` lets you select and download the server binary. It'll be the matching version for your machine. If you set `postgres-language-server.allowDownloadPrereleases` to true in yor VS Code settings, you'll be able to select prereleases.
- `Postgres Language Server: Get Current Version` will print the current version and the strategy with which the server binary was found.
- `Postgres Language Server: Start` and `Postgres Language Server: Stop` will stop or start the LSP server and the client.
- `Postgres Language Server: Restart` runs stop and start in succession.
- `Postgres Language Server: Copy Latest Server Logfile` copies the latest server log file to your currently opened repo. The log file is meant to be attached to GitHub issues, it can sometimes help us to debug.

## Multi-Root Workspaces

You can use the extension in a multi-root workspace setting, but there are a few caveats:

- You should use at least version 0.8.0 of the binary. You can upgrade it in your `package.json` or run `Postgres Language Server: Hard Reset (..)`.
- You can specify a `postgres-language-server.bin` and a `postgres-language-server.configFile` in your `.code-workspace` file, but you need to use an absolute path. The binary and the setting will then be used for all your workspace folders.
- If you don't specify a config file, the binary will look for a `postgres-language-server.jsonc` file at the every workspace folder's root level. If the file isn't there, the extension will be disabled for the folder. The individual `configFile` settings of the folders are ignored.
- The binary will currently only change database connections when a new file is opened, not when you alternate focus between two files. So, you might get linting/completions from a different database than you'd expect. For now, you can simply reopen the file, but we'll fix this soon 🙌

## Troubleshooting

1. First, try restarting the extension via the `Postgres Language Server: Hard Reset (...)` command mentioned above.
2. Open your VS Code Terminal, select the tab `Output`, and select one of the `postgres-language-server` extensions on the right. You might see what went wrong in the logs.
3. If you want to open a GitHub issue, it can sometimes help us if you attach the LSP server log file. We provide the `Postgres Language Server: Copy Latest Server Logfile` command to make that as easy as possible.

## FAQ

### I've installed the package via NPM but getting an `Error: Cannot find module '@postgres-language-server/cli-x86_64-windows-msvc/postgres-language-server.exe'`.

The platform-specific package is installed as an `optionalDependency`. If it can't be installed for whatever reason, `npm` won't complain. It's likely that something went wrong during the installation.

Another known issue is that npm installs the optional dependency at an unexpected location. It _should_ be located at `node_modules/@postgres-language-server/cli-aarch64-apple-darwin` (or another platform-specific package).

If you can't find the platform specific package, please just rerun `npm install` a couple of times.

If that still doesn't help, run `npm uninstall @postgres-language-server/cli` and use the download server strategy mentioned [here.](#setting-up-the-lsp-server)

### Why am I prompted to install the Postgres Language Server binary?

You will only be prompted if all other [strategies](#setting-up-the-lsp-server) fail. If you set out to use a different strategy, make sure the binary/node package is actually at the expected location:

- Using the `postgres-language-server.bin` setting -> Is the binary at the configured location?
- Using `npm` or `yarn` -> Are the `node_modules` installed correctly?
- Using the `PATH` environment variable -> Can you run `$ postgres-language-server --version`, is the binary at the expected location?

## Issues

If you experience any issues, please report them at the [postgres language server](https://github.com/supabase-community/postgres-language-server) repository – we'll most frequently read issues there.
