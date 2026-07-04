# Weekwise Asda Helper Extension

Private Chrome/Edge extension for guided Asda shopping from the Weekwise shopping list.

## Build

From the project root:

```bash
npm run build:extension
```

## Load In Chrome Or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this folder: `extension/asda-helper`.
5. Open Weekwise, go to Shopping, and click Send to Asda Helper.

If your deployed Vercel URL changes, update the URL in `manifest.json`, then reload the extension.
