import "../config/env";

import { shopifyRest } from "../services/shopifyHttp";

const OLD_HANDLE = "website-analysis-plans";
const NEW_HANDLE = "user-plans";
const NEW_TITLE = "User Plans";
const NEW_TEMPLATE_SUFFIX = "user-plans";
const NEW_SEO_TITLE =
  "User Plans - Understand Your Project, SaaS or Website Better | ITMart24";
const NEW_SEO_DESCRIPTION =
  "Compare ITMart24 user plans and choose the right analysis package for your project, SaaS, or website with clear reports, competitor insights, and practical action steps.";

type ShopifyPage = {
  id: number;
  title: string;
  handle: string;
  template_suffix?: string | null;
};

async function findTargetPage(): Promise<ShopifyPage> {
  const response = await shopifyRest.get("/pages.json", {
    params: { limit: 250 },
  });

  const pages = (response.data?.pages ?? []) as ShopifyPage[];

  const page =
    pages.find((entry) => entry.handle === OLD_HANDLE) ??
    pages.find((entry) => entry.handle === NEW_HANDLE) ??
    pages.find((entry) => entry.title === "Website Analysis Plans") ??
    pages.find((entry) => entry.title === NEW_TITLE);

  if (!page) {
    throw new Error(
      `Unable to find Shopify page by handles "${OLD_HANDLE}" or "${NEW_HANDLE}".`
    );
  }

  return page;
}

async function main() {
  const page = await findTargetPage();

  console.log(
    `Found page ${page.id}: ${page.title} (${page.handle}) template=${page.template_suffix ?? "default"}`
  );

  await shopifyRest.put(`/pages/${page.id}.json`, {
    page: {
      id: page.id,
      title: NEW_TITLE,
      handle: NEW_HANDLE,
      template_suffix: NEW_TEMPLATE_SUFFIX,
      metafields_global_title_tag: NEW_SEO_TITLE,
      metafields_global_description_tag: NEW_SEO_DESCRIPTION,
    },
  });

  const verifyResponse = await shopifyRest.get(`/pages/${page.id}.json`);
  const updatedPage = verifyResponse.data?.page as ShopifyPage | undefined;

  if (!updatedPage) {
    throw new Error("Shopify did not return the updated page payload.");
  }

  console.log(
    JSON.stringify(
      {
        id: updatedPage.id,
        title: updatedPage.title,
        handle: updatedPage.handle,
        template_suffix: updatedPage.template_suffix ?? null,
        expected_url: `https://itmart24.com/pages/${NEW_HANDLE}`,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
