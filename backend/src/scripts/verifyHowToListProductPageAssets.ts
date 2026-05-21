import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
};

const ASSET_KEYS = [
  "snippets/policy-page-content.liquid",
  "assets/section-main-page.css",
  "layout/theme.liquid",
] as const;

const MARKERS: Record<(typeof ASSET_KEYS)[number], string> = {
  "snippets/policy-page-content.liquid": "How to List a Product on ITMart24",
  "assets/section-main-page.css": ".policy-page--how-to-list-a-product .policy-page__hero",
  "layout/theme.liquid": "How to List a Product on ITMart24 | Vendor Listing Guide",
};

async function getLiveThemeId(): Promise<number> {
  const response = await shopifyRest.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const liveTheme = response.data.themes.find((theme) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Could not find the live Shopify theme.");
  }

  return liveTheme.id;
}

async function main() {
  const themeId = await getLiveThemeId();

  for (const assetKey of ASSET_KEYS) {
    const response = await shopifyRest.get(`/themes/${themeId}/assets.json`, {
      params: {
        "asset[key]": assetKey,
      },
    });

    const assetValue = String(response.data?.asset?.value ?? "");

    console.log(
      JSON.stringify(
        {
          themeId,
          assetKey,
          containsMarker: assetValue.includes(MARKERS[assetKey]),
          updatedAt: response.data?.asset?.updated_at ?? null,
        },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
