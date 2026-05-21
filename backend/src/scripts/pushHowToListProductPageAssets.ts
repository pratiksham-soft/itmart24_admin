import "../config/env";

import fs from "node:fs/promises";
import path from "node:path";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
};

const THEME_ROOT = "D:\\IT MART24\\System_Programs\\shopify_theme";

const ASSETS_TO_PUSH = [
  {
    localPath: path.join(THEME_ROOT, "snippets", "policy-page-content.liquid"),
    assetKey: "snippets/policy-page-content.liquid",
  },
  {
    localPath: path.join(THEME_ROOT, "assets", "section-main-page.css"),
    assetKey: "assets/section-main-page.css",
  },
  {
    localPath: path.join(THEME_ROOT, "layout", "theme.liquid"),
    assetKey: "layout/theme.liquid",
  },
] as const;

async function getLiveThemeId(): Promise<number> {
  const response = await shopifyRest.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const liveTheme = response.data.themes.find((theme) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Could not find the live Shopify theme.");
  }

  return liveTheme.id;
}

async function pushAsset(themeId: number, assetKey: string, localPath: string) {
  const value = await fs.readFile(localPath, "utf8");

  await shopifyRest.put(`/themes/${themeId}/assets.json`, {
    asset: {
      key: assetKey,
      value,
    },
  });

  console.log(`Updated ${assetKey} on live theme ${themeId}.`);
}

async function main() {
  const themeId = await getLiveThemeId();

  for (const asset of ASSETS_TO_PUSH) {
    await pushAsset(themeId, asset.assetKey, asset.localPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
