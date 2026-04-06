# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
just serve       # Start the Node.js server on port 3000
just printers    # Detect connected Brother USB devices via pyusb
just list        # List available just commands
node server.js   # Equivalent to just serve
```

There is no build step, test suite, or linter configured.

## Architecture

A zero-npm-dependency Node.js HTTP server (`server.js`) wraps a pre-compiled C binary (`bin/ptouch-print`) to provide a web UI for printing labels on a Brother P-Touch PT-P710BT via USB.

**Request flow:**
1. Browser (`public/index.html`) — single-file frontend (vanilla JS + CSS, no frameworks)
2. `POST /api/print` — server parses multipart form data, builds CLI args, spawns `ptouch-print`
3. `bin/ptouch-print` (macOS ARM64, libusb + GD) — renders text/images, sends to printer via USB, optionally outputs a PNG preview

**Key server endpoints:**
- `GET /api/info` — printer status (calls `ptouch-print --info`)
- `GET /api/list-supported` — supported printer models
- `POST /api/print` — print or preview; accepts JSON payload + optional image file parts

**Args builder** (`buildArgs()` in `server.js`) translates the UI state object into `ptouch-print` CLI flags. The UI sends a structured JSON payload describing each label element (text lines, images) plus global options (font, size, alignment, padding, cut marks, copies).

**No npm dependencies** — multipart parsing, file I/O, and child process execution are all done with Node.js built-ins. Temp files are written to `/tmp` and cleaned up after each request.

## ptouch-print binary

The `bin/ptouch-print` binary is macOS ARM64 only. To rebuild from source:
```bash
brew install libusb gd argp-standalone cmake
mkdir build && cd build
cmake .. -DCMAKE_EXE_LINKER_FLAGS="-L/opt/homebrew/lib"
make
```
Source: `git.famille-radermacher.ch/linux/ptouch-print.git`
