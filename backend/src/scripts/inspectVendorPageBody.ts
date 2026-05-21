import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

const VENDOR_PAGE_ID = "124057551087";

async function main() {
  const response = await shopifyRest.get(`/pages/${VENDOR_PAGE_ID}.json`);
  const body = String(response.data?.page?.body_html ?? "");

  console.log(
    body.includes("fetch('/apps/custom-portfolio-pricing'")
      ? "PAGE_BODY_HAS_OLD_ENDPOINT"
      : "PAGE_BODY_OLD_ENDPOINT_REMOVED"
  );
  console.log(
    body.includes("https://shavi.itmart24.com/api/custom-portfolio-pricing")
      ? "PAGE_BODY_HAS_SHAVI_ENDPOINT"
      : "PAGE_BODY_MISSING_SHAVI_ENDPOINT"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
