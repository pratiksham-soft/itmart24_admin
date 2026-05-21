import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

type ShopifyTheme = {
  id: number;
  role?: string;
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
  const response = await shopifyRest.get(`/themes/${themeId}/assets.json`, {
    params: {
      "asset[key]": "sections/founder-vendor-program.liquid",
    },
  });

  const value = String(response.data?.asset?.value ?? "");

  console.log(
    value.includes("https://shavi.itmart24.com/api/custom-portfolio-pricing")
      ? "ADMIN_HAS_SHAVI_ENDPOINT"
      : "ADMIN_MISSING_SHAVI_ENDPOINT"
  );
  console.log(
    value.includes("productCountRange: '2-5 products'")
      ? "ADMIN_HAS_VENDOR_PAYLOAD_REMAP"
      : "ADMIN_MISSING_VENDOR_PAYLOAD_REMAP"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
