# ptouch-print on macOS

A guide to building and using `ptouch-print` on macOS to print Brother P-Touch labels from the command line.

> Tested with: **PT-P710BT** on **macOS** (Apple Silicon), connected via USB.  
> Source: [git.familie-radermacher.ch/linux/ptouch-print](https://git.familie-radermacher.ch/linux/ptouch-print.git)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Connecting the Printer](#connecting-the-printer)
- [Usage Guide](#usage-guide)
  - [Verify the printer is detected](#verify-the-printer-is-detected)
  - [Printing text](#printing-text)
  - [Multi-line labels](#multi-line-labels)
  - [Previewing with PNG](#previewing-with-png)
  - [Printing images](#printing-images)
  - [Multiple labels in one run](#multiple-labels-in-one-run)
  - [Fonts](#fonts)
  - [Font size](#font-size)
  - [Padding](#padding)
  - [Cut marks](#cut-marks)
- [Tips](#tips)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- macOS with [Homebrew](https://brew.sh) installed
- Xcode Command Line Tools
- A USB cable (the PT-P710BT uses micro-USB)

> ⚠️ **Bluetooth note:** The PT-P710BT's Bluetooth only works with iOS/Android apps. For Mac, you must use USB.

---

## Installation

### 1. Install Xcode Command Line Tools

```bash
xcode-select --install
```

### 2. Install dependencies via Homebrew

```bash
brew install libusb gd argp-standalone cmake
```

### 3. Clone the source

```bash
git clone https://git.familie-radermacher.ch/linux/ptouch-print.git
cd ptouch-print
```

### 4. Build

```bash
mkdir build && cd build
cmake .. -DCMAKE_EXE_LINKER_FLAGS="-L/opt/homebrew/lib"
make
```

> The `-DCMAKE_EXE_LINKER_FLAGS` flag is required on Apple Silicon (M-series) Macs because Homebrew installs libraries to `/opt/homebrew/lib`, which is not on the default linker path.

### 5. (Optional) Install globally

```bash
sudo cp ptouch-print /usr/local/bin/
```

After this you can call `ptouch-print` from any directory without the `./` prefix.

---

## Connecting the Printer

1. Connect the printer to your Mac via USB
2. Power the printer on
3. If the printer has a **PLite button** (green LED): hold it for ~2 seconds until the light turns off — the printer must be in standard mode, not PLite mode, to be detected over USB

---

## Usage Guide

### Verify the printer is detected

```bash
ptouch-print --info
```

Expected output:
```
PT-P710BT found on USB bus 1, device 3
maximum printing width for this tape is 128px
media type = 01 (Laminated tape)
media width = 24 mm
tape color = 01 (White)
text color = 08 (Black)
error = 0000
```

If nothing is found, see [Troubleshooting](#troubleshooting).

---

### Printing text

```bash
ptouch-print --text "Hello World"
```

---

### Multi-line labels

Pass multiple quoted strings after `--text` to print on separate lines:

```bash
ptouch-print --text "John Doe" "john@example.com" "+41 79 123 45 67"
```

Up to 4–7 lines are supported depending on tape width and font size.

---

### Previewing with PNG

Always preview before printing to avoid wasting tape. The printer must still be connected for this to work (it reads tape width from the device).

```bash
ptouch-print --text "Hello World" --writepng preview.png
open preview.png
```

You can also generate a PNG and print it in the same command:

```bash
ptouch-print --text "Hello World" --writepng preview.png
ptouch-print --image preview.png
```

---

### Printing images

Images must be **black and white (1-bit) PNG** files. Convert with ImageMagick if needed:

```bash
# Install ImageMagick
brew install imagemagick

# Convert to 1-bit PNG
convert input.png -threshold 50% -type Bilevel output.png

# Print
ptouch-print --image output.png
```

The image height must match the tape's print width in pixels (e.g. 128px for 24mm tape).

---

### Multiple labels in one run

Printing multiple labels in a single command saves tape, because the printer only feeds once at the start.

```bash
ptouch-print --text "Server 01" --cutmark \
             --text "Server 02" --cutmark \
             --text "Server 03" --cutmark
```

You can also mix text and images:

```bash
ptouch-print --image logo.png --cutmark \
             --text "Label Text" --cutmark
```

---

### Fonts

Use any font installed on your system (visible in Font Book). Append style modifiers directly to the name:

```bash
ptouch-print --font "Helvetica" --text "Hello"
ptouch-print --font "Helvetica Bold" --text "Hello"
ptouch-print --font "Courier New" --text "Hello"
```

Default font is **Helvetica**.

List all available font names:

```bash
fc-list : family | sort
```

---

### Font size

By default, font size is chosen automatically to fill the tape height. Override it manually:

```bash
ptouch-print --fontsize 32 --text "Small text"
```

> Note: if the font size is too large, text will be cut off. Use `--writepng` to preview first.

---

### Padding

Add horizontal space (in pixels) between elements:

```bash
ptouch-print --image left.png --pad 20 --image right.png
```

---

### Cut marks

`--cutmark` inserts a dashed cut line between label sections. It does not trigger the cutter automatically — it's a visual guide only.

```bash
ptouch-print --text "Label A" --cutmark --text "Label B"
```

---

## Tips

- **Always preview with `--writepng` first** — tape is not cheap.
- **Print multiple labels per run** — there is always 20–30mm of blank tape fed before the first print. Batching saves tape.
- **Check tape width** — run `--info` after changing tape cassettes, as print width varies (e.g. 64px for 12mm, 128px for 24mm).
- **Image height must match tape print width** — if printing PNGs, make sure the image height in pixels matches the value shown in `--info` under "maximum printing width".

---

## Troubleshooting

### Printer not found

- Make sure the USB cable is connected and the printer is powered on
- Try a different USB port or cable
- If there's a PLite LED: hold the PLite button for ~2 seconds until the light goes off
- Run with `--debug` for more detail: `ptouch-print --debug --info`

### Linker error: `library 'usb-1.0' not found`

Pass the Homebrew lib path explicitly during cmake:

```bash
cmake .. -DCMAKE_EXE_LINKER_FLAGS="-L/opt/homebrew/lib"
```

### `Could not find GD library`

```bash
brew install gd
```

### `Could NOT find argp`

```bash
brew install argp-standalone
```

### Image prints at wrong size or is distorted

- Ensure the PNG is exactly the right height in pixels (check `--info` for "maximum printing width")
- Ensure the image is 1-bit black and white (not greyscale or colour)
- Use ImageMagick to convert: `convert input.png -threshold 50% -type Bilevel output.png`

