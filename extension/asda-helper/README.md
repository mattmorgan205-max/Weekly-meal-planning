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

For unresolved items at the end of a shop, keep the trolley tab open. Choose **Verify basket**, then **Find product choices**. The helper reads ASDA search results in temporary tabs without adding products. Select one product per item, or **Skip this item**. Copy the updated brief back to ChatGPT to act on your choices. Choices are for this shop only, not saved favourites; refreshing product choices starts a new selection. Missing product information or no suitable results means manual review, not a guessed substitution.

Generic requests use standard products: a product advertised as gluten-free or Free From is not a default substitute. Request gluten-free explicitly when needed; always verify allergen information on the product.
