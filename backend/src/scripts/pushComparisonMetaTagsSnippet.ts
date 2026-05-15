import "../config/env";
import fs from "node:fs/promises";
import path from "node:path";
import { shopifyRest } from "../services/shopifyHttp";

const THEME_ROOT = "D:\\IT MART24\\System_Programs\\shopify_theme";
const ASSET_KEY = "snippets/meta-tags.liquid";

const main = async () => {
  const assetPath = path.join(THEME_ROOT, ...ASSET_KEY.split("/"));
  const value = await fs.readFile(assetPath, "utf8");

  const themesResponse = await shopifyRest.get("/themes.json");
  const themes = Array.isArray(themesResponse.data?.themes)
    ? themesResponse.data.themes
    : [];
  const liveTheme = themes.find((theme: { role?: string }) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Live Shopify theme was not found.");
  }

  await shopifyRest.put(`/themes/${liveTheme.id}/assets.json`, {
    asset: {
      key: ASSET_KEY,
      value,
    },
  });

  console.log(`Pushed ${ASSET_KEY} to live theme ${liveTheme.id}.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
