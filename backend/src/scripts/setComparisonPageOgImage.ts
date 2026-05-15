import "../config/env";

import { shopifyGraphQL } from "../services/shopifyHttp";

const HANDLE = "interserver-shared-hosting-vs-greengeeks-woocommerce-hosting";
const OG_IMAGE =
  "https://cdn.shopify.com/s/files/1/0770/5192/0623/files/InterServerShared_Hosting_vs_Green_Geeks__WooCommerce__Hosting.png";

type GraphQlError = {
  message?: string;
};

type UserError = {
  field?: string[] | null;
  message?: string | null;
};

const graphqlRequest = async <TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> => {
  const response = await shopifyGraphQL.post("", { query, variables });

  const errors = response.data?.errors as GraphQlError[] | undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(
      errors.map((error) => error.message?.trim()).filter(Boolean).join(", ") ||
        "Shopify GraphQL request failed."
    );
  }

  return response.data.data as TData;
};

const formatUserErrors = (errors: UserError[]) =>
  errors
    .map((error) => {
      const field =
        Array.isArray(error.field) && error.field.length > 0
          ? `${error.field.join(".")}: `
          : "";
      return `${field}${error.message ?? "Unknown error"}`;
    })
    .join("; ");

const main = async () => {
  const pageData = await graphqlRequest<{
    pages: {
      nodes: Array<{
        id: string;
        handle: string;
      }>;
    };
  }>(
    `
      query PageByHandle($query: String!) {
        pages(first: 10, query: $query) {
          nodes {
            id
            handle
          }
        }
      }
    `,
    {
      query: `handle:${HANDLE}`,
    }
  );

  const page = pageData.pages.nodes.find((node) => node.handle === HANDLE);
  if (!page) {
    throw new Error(`Page ${HANDLE} was not found in Shopify.`);
  }

  const mutationData = await graphqlRequest<{
    metafieldsSet: {
      userErrors: UserError[];
    };
  }>(
    `
      mutation SetPageOgImage($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      metafields: [
        {
          ownerId: page.id,
          namespace: "custom",
          key: "og_image",
          type: "url",
          value: OG_IMAGE,
        },
      ],
    }
  );

  if (mutationData.metafieldsSet.userErrors.length > 0) {
    throw new Error(formatUserErrors(mutationData.metafieldsSet.userErrors));
  }

  console.log(`Updated custom.og_image for ${HANDLE}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
