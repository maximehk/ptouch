# labels

Web UI for printing labels on a Brother P-Touch PT-P710BT via USB.

## Usage

```bash
just serve   # start the server on http://localhost:3000
```

Open the browser UI, compose your label, and hit Print or Preview.

## Requirements

- macOS (Apple Silicon)
- Brother PT-P710BT connected via USB
- Node.js

## Building the binary

The `bin/ptouch-print` binary (macOS ARM64) is included. To rebuild from source, see [docs/building-the-binary.md](docs/building-the-binary.md).
