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

## Finish a shop with ChatGPT

Open the ASDA trolley and select **Verify basket** in the Weekwise overlay. If anything is short, missing or uncertain, select **Copy remaining shop for ChatGPT**. Select your ASDA Chrome tab in ChatGPT and paste the brief. No shopping data is sent to ChatGPT by the button itself. Items marked **Looks ok** are omitted. Verify again after changing the trolley; checkout stays manual.

After updating an unpacked extension, click **Reload** in Chrome's extensions page and refresh the ASDA tab.
