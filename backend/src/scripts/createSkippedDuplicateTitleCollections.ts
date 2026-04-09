import "../config/env";
import fs from "fs";
import path from "path";
import { shopifyGraphQL, shopifyRest } from "../services/shopifyHttp";

const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
const EXPORTS_DIR = path.join(__dirname, "../../exports");

type MutationUserError = {
  field?: string[] | null;
  message?: string;
};

type ShopifyCollection = {
  id: number;
  title?: string;
  handle?: string | null;
};

type ShopifyPublication = {
  id: string;
  name?: string;
};

type ShopifyMetafieldDefinition = {
  id: string;
  capabilities?: {
    smartCollectionCondition?: {
      enabled?: boolean;
    } | null;
  } | null;
};

type PreviousImportReport = {
  generatedAt?: string;
  skipped?: Array<{
    rowNumber?: number;
    title?: string;
    handle?: string;
    reason?: string;
  }>;
};

type RetryRow = {
  rowNumber: number;
  title: string;
  handle: string;
  reason: string;
};

type CreatedRecord = {
  rowNumber: number;
  title: string;
  handle: string;
  collectionId: number | null;
  publicationCount: number;
  collectionUrl: string | null;
};

type SkippedRecord = {
  rowNumber: number;
  title: string;
  handle: string;
  reason: string;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeKey = (value: string) =>
  value.trim().toLowerCase();

const csvEscape = (value: string | number | null | undefined) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const extractNextPageInfo = (
  linkHeader?: string
): string | null => {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader
    .split(",")
    .find((entry) => entry.includes('rel="next"'));

  if (!nextLink) {
    return null;
  }

  const match = nextLink.match(/<([^>]+)>/);

  if (!match?.[1]) {
    return null;
  }

  return new URL(match[1]).searchParams.get("page_info");
};

const parseNumericIdFromGid = (gid?: string | null) => {
  if (typeof gid !== "string") {
    return null;
  }

  const match = gid.match(/\/(\d+)$/);

  return match?.[1] ? Number(match[1]) : null;
};

const getGraphQlErrorMessage = (
  errors?: Array<{ message?: string }> | null,
  fallback = "Shopify request failed"
) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return fallback;
  }

  const message = errors
    .map((error) => error.message?.trim())
    .filter(Boolean)
    .join(", ");

  return message || fallback;
};

const formatUserErrors = (
  userErrors: MutationUserError[],
  fallback: string
) => {
  const message = userErrors
    .map((error) => {
      const field =
        Array.isArray(error.field) && error.field.length > 0
          ? `${error.field.join(".")}: `
          : "";
      return `${field}${error.message?.trim() ?? ""}`.trim();
    })
    .filter(Boolean)
    .join(", ");

  return message || fallback;
};

const isRetryableError = (error: any) => {
  const status = error?.response?.status;
  const errors = error?.response?.data?.errors;
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  if (Array.isArray(errors)) {
    const joinedErrors = errors
      .map((item) =>
        typeof item?.message === "string" ? item.message.toLowerCase() : ""
      )
      .join(" ");
    if (joinedErrors.includes("throttled")) {
      return true;
    }
  }

  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("throttled")
  );
};

const withRetries = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(
        `[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const fetchAllShopifyResources = async <T>(
  pathName: string,
  responseKey: string
): Promise<T[]> => {
  const results: T[] = [];
  let pageInfo: string | null = null;

  do {
    const params = pageInfo
      ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
      : { limit: SHOPIFY_PAGE_LIMIT };

    const response: {
      data: Record<string, T[] | undefined>;
      headers: { link?: string };
    } = await withRetries(`GET ${pathName}`, () =>
      shopifyRest.get(pathName, { params })
    );

    const pageItems = Array.isArray(response.data?.[responseKey])
      ? response.data[responseKey]
      : [];

    results.push(...pageItems);
    pageInfo = extractNextPageInfo(response.headers.link);
  } while (pageInfo);

  return results;
};

const fetchAllShopifyCollections = async () => {
  const [customCollections, smartCollections] = await Promise.all([
    fetchAllShopifyResources<ShopifyCollection>(
      "/custom_collections.json",
      "custom_collections"
    ),
    fetchAllShopifyResources<ShopifyCollection>(
      "/smart_collections.json",
      "smart_collections"
    ),
  ]);

  return [...customCollections, ...smartCollections];
};

const fetchAllPublications = async () => {
  const publications: ShopifyPublication[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  const query = `
    query GetPublications($first: Int!, $after: String) {
      publications(first: $first, after: $after) {
        nodes {
          id
          name
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  while (hasNextPage) {
    const response: {
      data?: {
        data?: {
          publications?: {
            nodes?: ShopifyPublication[];
            pageInfo?: {
              hasNextPage?: boolean;
              endCursor?: string | null;
            };
          };
        };
        errors?: Array<{ message?: string }>;
      };
    } = await withRetries("Fetch publications", () =>
      shopifyGraphQL.post("", {
        query,
        variables: {
          first: SHOPIFY_GRAPHQL_PAGE_SIZE,
          after: cursor,
        },
      })
    );

    if (response.data?.errors?.length) {
      throw new Error(
        getGraphQlErrorMessage(
          response.data.errors,
          "Failed to load Shopify sales channels"
        )
      );
    }

    const publicationsConnection =
      response.data?.data?.publications;
    const pagePublications = Array.isArray(publicationsConnection?.nodes)
      ? publicationsConnection.nodes
      : [];

    publications.push(...pagePublications);
    hasNextPage = Boolean(publicationsConnection?.pageInfo?.hasNextPage);
    cursor = publicationsConnection?.pageInfo?.endCursor ?? null;
  }

  return publications;
};

const fetchTypeMultipleMetafieldDefinition = async () => {
  const response: {
    data?: {
      data?: {
        metafieldDefinition?: ShopifyMetafieldDefinition | null;
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries("Fetch type_multiple metafield definition", () =>
    shopifyGraphQL.post("", {
      query: `
        query GetTypeMultipleMetafieldDefinition(
          $identifier: MetafieldDefinitionIdentifierInput!
        ) {
          metafieldDefinition(identifier: $identifier) {
            id
            capabilities {
              smartCollectionCondition {
                enabled
              }
            }
          }
        }
      `,
      variables: {
        identifier: {
          ownerType: "PRODUCT",
          namespace: "custom",
          key: "type_multiple",
        },
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        "Failed to load the Type Multiple metafield definition"
      )
    );
  }

  return response.data?.data?.metafieldDefinition ?? null;
};

const ensureTypeMultipleSmartCollectionDefinition = async () => {
  const existingDefinition =
    await fetchTypeMultipleMetafieldDefinition();

  if (
    existingDefinition?.capabilities?.smartCollectionCondition?.enabled
  ) {
    return existingDefinition;
  }

  if (!existingDefinition) {
    const createResponse: {
      data?: {
        data?: {
          metafieldDefinitionCreate?: {
            createdDefinition?: ShopifyMetafieldDefinition | null;
            userErrors?: MutationUserError[];
          };
        };
        errors?: Array<{ message?: string }>;
      };
    } = await withRetries(
      "Create type_multiple metafield definition",
      () =>
        shopifyGraphQL.post("", {
          query: `
            mutation CreateTypeMultipleMetafieldDefinition(
              $definition: MetafieldDefinitionInput!
            ) {
              metafieldDefinitionCreate(definition: $definition) {
                createdDefinition {
                  id
                  capabilities {
                    smartCollectionCondition {
                      enabled
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            definition: {
              name: "Type Multiple",
              namespace: "custom",
              key: "type_multiple",
              ownerType: "PRODUCT",
              type: "list.single_line_text_field",
              capabilities: {
                smartCollectionCondition: {
                  enabled: true,
                },
              },
            },
          },
        })
    );

    if (createResponse.data?.errors?.length) {
      throw new Error(
        getGraphQlErrorMessage(
          createResponse.data.errors,
          "Failed to create the Type Multiple metafield definition"
        )
      );
    }

    const payload =
      createResponse.data?.data?.metafieldDefinitionCreate;
    const userErrors = payload?.userErrors ?? [];

    if (userErrors.length > 0) {
      throw new Error(
        formatUserErrors(
          userErrors,
          "Failed to enable Type Multiple as a smart collection condition"
        )
      );
    }

    if (!payload?.createdDefinition?.id) {
      throw new Error(
        "Shopify did not return the created Type Multiple metafield definition"
      );
    }

    return payload.createdDefinition;
  }

  const updateResponse: {
    data?: {
      data?: {
        metafieldDefinitionUpdate?: {
          updatedDefinition?: ShopifyMetafieldDefinition | null;
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(
    "Update type_multiple metafield definition",
    () =>
      shopifyGraphQL.post("", {
        query: `
          mutation UpdateTypeMultipleMetafieldDefinition(
            $definition: MetafieldDefinitionUpdateInput!
          ) {
            metafieldDefinitionUpdate(definition: $definition) {
              updatedDefinition {
                id
                capabilities {
                  smartCollectionCondition {
                    enabled
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          definition: {
            namespace: "custom",
            key: "type_multiple",
            ownerType: "PRODUCT",
            capabilities: {
              smartCollectionCondition: {
                enabled: true,
              },
            },
          },
        },
      })
  );

  if (updateResponse.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        updateResponse.data.errors,
        "Failed to update the Type Multiple metafield definition"
      )
    );
  }

  const updatePayload =
    updateResponse.data?.data?.metafieldDefinitionUpdate;
  const updateUserErrors = updatePayload?.userErrors ?? [];

  if (updateUserErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        updateUserErrors,
        "Failed to enable Type Multiple as a smart collection condition"
      )
    );
  }

  if (!updatePayload?.updatedDefinition?.id) {
    throw new Error(
      "Shopify did not return the updated Type Multiple metafield definition"
    );
  }

  return updatePayload.updatedDefinition;
};

const createSmartCollection = async ({
  title,
  handle,
  metafieldDefinitionId,
}: {
  title: string;
  handle: string;
  metafieldDefinitionId: string;
}) => {
  const response: {
    data?: {
      data?: {
        collectionCreate?: {
          collection?: {
            id?: string;
            title?: string;
            handle?: string | null;
          } | null;
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Create collection ${title} (${handle})`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation CreateSmartCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        input: {
          title,
          handle,
          ruleSet: {
            appliedDisjunctively: true,
            rules: [
              {
                column: "PRODUCT_METAFIELD_DEFINITION",
                relation: "EQUALS",
                condition: title,
                conditionObjectId: metafieldDefinitionId,
              },
            ],
          },
        },
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        `Failed to create Shopify collection "${title}"`
      )
    );
  }

  const payload = response.data?.data?.collectionCreate;

  return {
    collection: payload?.collection ?? null,
    userErrors: payload?.userErrors ?? [],
  };
};

const publishCollectionToAllPublications = async (
  collectionId: string,
  publications: ShopifyPublication[]
) => {
  if (publications.length === 0) {
    return {
      publicationCount: 0,
    };
  }

  const publishResponse: {
    data?: {
      data?: {
        publishablePublish?: {
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Publish collection ${collectionId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation PublishCollectionToAllChannels(
          $id: ID!
          $input: [PublicationInput!]!
        ) {
          publishablePublish(id: $id, input: $input) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        id: collectionId,
        input: publications.map((publication) => ({
          publicationId: publication.id,
        })),
      },
    })
  );

  if (publishResponse.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        publishResponse.data.errors,
        "Collection was created but could not be published to sales channels"
      )
    );
  }

  const publishUserErrors =
    publishResponse.data?.data?.publishablePublish?.userErrors ?? [];

  if (publishUserErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        publishUserErrors,
        "Collection was created but could not be published to sales channels"
      )
    );
  }

  return {
    publicationCount: publications.length,
  };
};

const deleteCollection = async (collectionId: string) => {
  const response: {
    data?: {
      data?: {
        collectionDelete?: {
          deletedCollectionId?: string | null;
          userErrors?: MutationUserError[];
        };
      };
      errors?: Array<{ message?: string }>;
    };
  } = await withRetries(`Delete collection ${collectionId}`, () =>
    shopifyGraphQL.post("", {
      query: `
        mutation DeleteCollection($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        input: {
          id: collectionId,
        },
      },
    })
  );

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(
        response.data.errors,
        "Failed to delete Shopify collection during cleanup"
      )
    );
  }

  const payload = response.data?.data?.collectionDelete;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        userErrors,
        "Failed to delete Shopify collection during cleanup"
      )
    );
  }

  if (!payload?.deletedCollectionId) {
    throw new Error(
      "Shopify did not confirm the collection deletion during cleanup"
    );
  }
};

const getLatestPreviousReportPath = async () => {
  const fileNames = await fs.promises.readdir(EXPORTS_DIR);

  const candidates = await Promise.all(
    fileNames
      .filter(
        (fileName) =>
          /^shopify-collection-import-.*\.json$/i.test(fileName) &&
          !fileName.endsWith("-duplicate-title-retry.json")
      )
      .map(async (fileName) => {
        const fullPath = path.join(EXPORTS_DIR, fileName);
        const stats = await fs.promises.stat(fullPath);
        return {
          fullPath,
          mtimeMs: stats.mtimeMs,
        };
      })
  );

  const latest = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

  if (!latest) {
    throw new Error(
      `No previous shopify-collection-import JSON report found in ${EXPORTS_DIR}`
    );
  }

  return latest.fullPath;
};

const loadRetryRows = async (): Promise<{
  previousReportPath: string;
  rows: RetryRow[];
}> => {
  const previousReportPath = await getLatestPreviousReportPath();
  const rawContent = await fs.promises.readFile(previousReportPath, "utf8");
  const report = JSON.parse(rawContent) as PreviousImportReport;

  const rows = Array.isArray(report.skipped)
    ? report.skipped
        .filter((entry) =>
          entry.reason?.startsWith("Duplicate title in CSV")
        )
        .map((entry) => ({
          rowNumber: Number(entry.rowNumber),
          title: entry.title?.trim() ?? "",
          handle: entry.handle?.trim() ?? "",
          reason: entry.reason?.trim() ?? "",
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.rowNumber) &&
            entry.rowNumber > 0 &&
            Boolean(entry.title) &&
            Boolean(entry.handle)
        )
    : [];

  if (rows.length === 0) {
    throw new Error(
      `No duplicate-title skipped rows were found in ${previousReportPath}`
    );
  }

  return {
    previousReportPath,
    rows,
  };
};

const writeReportFiles = async ({
  previousReportPath,
  created,
  skipped,
}: {
  previousReportPath: string;
  created: CreatedRecord[];
  skipped: SkippedRecord[];
}) => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const baseName = `shopify-collection-import-${timestamp}-duplicate-title-retry`;

  const summaryPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const skippedCsvPath = path.join(EXPORTS_DIR, `${baseName}-skipped.csv`);

  const summary = {
    generatedAt: new Date().toISOString(),
    previousReportPath,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  };

  await fs.promises.writeFile(
    summaryPath,
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const skippedCsv = [
    ["row_number", "title", "handle", "reason"]
      .map((value) => csvEscape(value))
      .join(","),
    ...skipped.map((record) =>
      [
        record.rowNumber,
        record.title,
        record.handle,
        record.reason,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await fs.promises.writeFile(skippedCsvPath, skippedCsv, "utf8");

  return {
    summaryPath,
    skippedCsvPath,
  };
};

const main = async () => {
  const { previousReportPath, rows } = await loadRetryRows();
  console.log(`Using previous report: ${previousReportPath}`);
  console.log(`Loaded ${rows.length} duplicate-title skipped rows for retry.`);

  const [existingCollections, publications, metafieldDefinition] =
    await Promise.all([
      fetchAllShopifyCollections(),
      fetchAllPublications(),
      ensureTypeMultipleSmartCollectionDefinition(),
    ]);

  const existingHandles = new Map<
    string,
    { id: number; title: string; handle: string | null }
  >();

  existingCollections.forEach((collection) => {
    const handle = collection.handle?.trim() ?? null;
    if (!handle) {
      return;
    }

    existingHandles.set(normalizeKey(handle), {
      id: collection.id,
      title: collection.title?.trim() ?? "Untitled Collection",
      handle,
    });
  });

  const created: CreatedRecord[] = [];
  const skipped: SkippedRecord[] = [];

  for (const row of rows) {
    const { rowNumber, title, handle } = row;
    const normalizedHandle = normalizeKey(handle);

    const existingByHandle = existingHandles.get(normalizedHandle);
    if (existingByHandle) {
      skipped.push({
        rowNumber,
        title,
        handle,
        reason: `Handle already exists in Shopify on collection "${existingByHandle.title}" (id ${existingByHandle.id}).`,
      });
      continue;
    }

    console.log(
      `Retrying row ${rowNumber}: creating duplicate-title smart collection "${title}" with handle "${handle}".`
    );

    let createdCollectionId: string | null = null;

    try {
      const createResult = await createSmartCollection({
        title,
        handle,
        metafieldDefinitionId: metafieldDefinition.id,
      });

      if (createResult.userErrors.length > 0) {
        skipped.push({
          rowNumber,
          title,
          handle,
          reason: formatUserErrors(
            createResult.userErrors,
            "Shopify rejected collection creation"
          ),
        });
        continue;
      }

      if (!createResult.collection?.id) {
        skipped.push({
          rowNumber,
          title,
          handle,
          reason: "Shopify did not return the created collection",
        });
        continue;
      }

      createdCollectionId = createResult.collection.id;
      const actualHandle = createResult.collection.handle?.trim() ?? "";

      if (actualHandle !== handle) {
        await deleteCollection(createdCollectionId);
        createdCollectionId = null;

        skipped.push({
          rowNumber,
          title,
          handle,
          reason: `Requested handle "${handle}" was not applied. Shopify returned "${actualHandle || "blank"}" and the collection was deleted.`,
        });
        continue;
      }

      const publishResult = await publishCollectionToAllPublications(
        createdCollectionId,
        publications
      );

      const numericId = parseNumericIdFromGid(createdCollectionId);

      created.push({
        rowNumber,
        title,
        handle,
        collectionId: numericId,
        publicationCount: publishResult.publicationCount,
        collectionUrl: `https://${process.env.SHOPIFY_STORE_DOMAIN}/collections/${handle}`,
      });

      existingHandles.set(normalizedHandle, {
        id: numericId ?? -1,
        title,
        handle,
      });
    } catch (error: any) {
      const errorMessage =
        error?.message || "Unknown Shopify collection creation failure";

      if (createdCollectionId) {
        try {
          await deleteCollection(createdCollectionId);
          createdCollectionId = null;
          skipped.push({
            rowNumber,
            title,
            handle,
            reason: `${errorMessage}. Temporary collection was deleted during cleanup.`,
          });
          continue;
        } catch (cleanupError: any) {
          throw new Error(
            `${errorMessage}. Cleanup also failed for ${createdCollectionId}: ${cleanupError?.message || "Unknown cleanup error"}`
          );
        }
      }

      skipped.push({
        rowNumber,
        title,
        handle,
        reason: errorMessage,
      });
    }
  }

  const reportPaths = await writeReportFiles({
    previousReportPath,
    created,
    skipped,
  });

  console.log(`Created ${created.length} duplicate-title collection(s).`);
  console.log(`Skipped ${skipped.length} duplicate-title collection(s).`);
  console.log(`Summary report: ${reportPaths.summaryPath}`);
  console.log(`Skipped CSV: ${reportPaths.skippedCsvPath}`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Duplicate-title Shopify collection retry failed:", error);
    process.exit(1);
  });
