# File Manager

A desktop file batch-renaming tool.

## Features

- Browse directories via dialog or manual path entry
- Filter files by name pattern
- Match files using regex capture groups
- Rename files using a pattern with group references (`$<groupName>`)
- Insert captured groups into the rename pattern with one click
- Auto-update on launch

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

MIT
