import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
};

type ShopifyAssetListItem = {
  key: string;
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
  const listResponse = await shopifyRest.get<{ assets: ShopifyAssetListItem[] }>(
    `/themes/${themeId}/assets.json`
  );

  for (const asset of listResponse.data.assets) {
    if (!/\.(liquid|js)$/.test(asset.key)) {
      continue;
    }

    const assetResponse = await shopifyRest.get(`/themes/${themeId}/assets.json`, {
      params: {
        "asset[key]": asset.key,
      },
    });

    const value = String(assetResponse.data?.asset?.value ?? "");
    if (value.includes("customPortfolioApiBase") || value.includes("getCustomPortfolioEndpoint")) {
      console.log(asset.key);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
