# File Manager

A desktop file batch-renaming tool.

## Features

- Browse folders via dialog or manual path entry
- Filter files by name pattern
- Match files using regex capture groups
- Rename files using a pattern with group references (`$<groupName>`)
- Insert captured groups into the rename pattern with one click
- Auto-update on launch

## Installation

### macOS

Download the `.dmg` from the [latest release](../../releases/latest), open it, and drag the app to your Applications folder.

Since the app is not code-signed, macOS may show a "damaged" error. To fix this, run:

```sh
xattr -cr /Applications/File\ Manager.app
```

## Development

**Prerequisites:** [Node.js](https://nodejs.org), [pnpm](https://pnpm.io), [Rust](https://rustup.rs)

```sh
pnpm install
pnpm tauri dev
```

### Other commands

| Command       | Description          |
| ------------- | -------------------- |
| `pnpm build`  | Build for production |
| `pnpm test`   | Run tests            |
| `pnpm lint`   | Lint source files    |
| `pnpm format` | Format source files  |

## License

MIT @ yawn west
