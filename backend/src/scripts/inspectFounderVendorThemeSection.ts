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
  const lines = value.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (
      line.includes('action="javascript:void(0)"') ||
      line.includes('onsubmit="return false;"') ||
      line.includes("Thank you for your interest in ITMart24. Our sales team has received your request and will review your details. We will contact you shortly.") ||
      line.includes('name="fullName"') ||
      line.includes('name="contactName"') ||
      line.includes("fullName:") ||
      line.includes("contactName:") ||
      line.includes("payload = {") ||
      line.includes("form.elements.fullName") ||
      line.includes("form.elements.contactName") ||
      line.includes("Contact Person Name")
    ) {
      console.log(`${index + 1}: ${line}`);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
