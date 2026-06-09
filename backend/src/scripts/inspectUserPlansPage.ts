import "../config/env";

import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const PAGE_ID = "132790943983";
const HANDLE = "user-plans";

async function main() {
  const restResponse = await shopifyRest.get(`/pages/${PAGE_ID}.json`);
  console.log("REST PAGE");
  console.log(JSON.stringify(restResponse.data?.page ?? null, null, 2));

  const graphqlResponse = await shopifyGraphQL.post("", {
    query: `
      query InspectPage($query: String!) {
        pages(first: 10, query: $query) {
          nodes {
            id
            title
            handle
            templateSuffix
            isPublished
            onlineStoreUrl
            publishedAt
          }
        }
      }
    `,
    variables: {
      query: `handle:${HANDLE}`,
    },
  });

  console.log("GRAPHQL PAGE SEARCH");
  console.log(JSON.stringify(graphqlResponse.data ?? null, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
