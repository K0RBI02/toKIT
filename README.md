# toKIT

The small tools you need now and then, without the paywall, the ads or the "sign up to download".
Everything runs in your browser and your files never leave your device. The one exception is the
currency converter, which fetches the European Central Bank's rates from frankfurter.dev.

## How it works

One sheet of grid paper and a camera, in the same style as [k0rbi02.github.io](https://k0rbi02.github.io).
Drop a file on the terminal (or anywhere): the camera zooms in on the free space, which now shows what
you can do with that file. Pick one and the camera moves past the terminal to the tool. The terminal
shows what is going on, including every file you save.

## Tools

- **PDF**: sign, merge, rotate & reorder pages, split, extract pages, page numbers, watermark, make smaller, PDF to text, PDF to images, images to PDF
- **Images**: convert, resize, compress, crop & rotate, read text (OCR, also for scanned PDFs), iPhone photos (HEIC) to JPG, remove photo metadata
- **Office**: Word to PDF, text or HTML, Excel to CSV or JSON, CSV to Excel, text from slides, images from Office files
- **Audio & video**: trim audio, convert audio (MP3, WAV), video to MP3, trim a video, video to GIF
- **Text & files**: word counter, text case, compare texts, format JSON, Base64, URL encode, checksums, sort & clean lines, open a ZIP, make a ZIP
- **Generators**: QR codes, barcodes, passwords, UUIDs, colour palettes, random picker, placeholder text
- **Converters**: units, currency, time zones, Unix timestamps, number systems, colour formats, dates, percentages

Tools that need a bigger download load it the first time you use them and then run on your device:
text recognition (about 10 MB) and HEIC (about 1 MB).

## Run locally

```bash
python -m http.server 4331
```

Then open http://localhost:4331. Plain HTML, CSS and JavaScript, no build step.

## Adding a tool

Tools live in `js/tools/<category>.js`. Each one calls `tool({...})`:

```js
tool({
  id: 'my-tool',            // used in the URL: #/my-tool
  cat: 'text',              // pdf, image, text, generate or convert
  name: 'My tool',
  desc: 'One line for the home page.',
  intro: 'One or two sentences shown on the tool page.',
  keywords: 'words people might search for',
  mount(root) {
    const { work, side } = layout(root);   // work area left, options and main button right
    // build the tool with h(), field(), segmented(), button(..., 'primary'), actions(...)
  },
});
```

Libraries load from cdnjs, unpkg, jsDelivr and esm.sh only when a tool needs them.
