import "../config/env";

import fs from "node:fs/promises";
import path from "node:path";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
  name?: string;
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
  const snippetPath = path.resolve(
    "D:\\IT MART24\\System_Programs\\shopify_theme\\snippets\\meta-tags.liquid"
  );
  const snippetValue = await fs.readFile(snippetPath, "utf8");
  const themeId = await getLiveThemeId();

  await shopifyRest.put(`/themes/${themeId}/assets.json`, {
    asset: {
      key: "snippets/meta-tags.liquid",
      value: snippetValue,
    },
  });

  console.log(`Updated snippets/meta-tags.liquid on live theme ${themeId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
