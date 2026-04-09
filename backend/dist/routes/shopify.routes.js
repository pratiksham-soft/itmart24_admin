"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shopifyHttp_1 = require("../services/shopifyHttp");
const router = (0, express_1.Router)();
const DEFAULT_STORE_DOMAIN = "www.itmart24.com";
const SHOPIFY_PAGE_LIMIT = 250;
const SHOPIFY_PRODUCTS_CACHE_TTL_MS = 60 * 1000;
const SHOPIFY_COLLECTIONS_CACHE_TTL_MS = 60 * 1000;
const SHOPIFY_GRAPHQL_PAGE_SIZE = 100;
let cachedShopifyProductsResponse = null;
let cachedShopifyProductsFetchedAt = 0;
let cachedShopifyCollectionsResponse = null;
let cachedShopifyCollectionsFetchedAt = 0;
const isShopifyProductsCacheFresh = () => cachedShopifyProductsResponse !== null &&
    Date.now() - cachedShopifyProductsFetchedAt <
        SHOPIFY_PRODUCTS_CACHE_TTL_MS;
const isShopifyCollectionsCacheFresh = () => cachedShopifyCollectionsResponse !== null &&
    Date.now() - cachedShopifyCollectionsFetchedAt <
        SHOPIFY_COLLECTIONS_CACHE_TTL_MS;
const clearShopifyCollectionsCache = () => {
    cachedShopifyCollectionsResponse = null;
    cachedShopifyCollectionsFetchedAt = 0;
};
const clearShopifyProductsCache = () => {
    cachedShopifyProductsResponse = null;
    cachedShopifyProductsFetchedAt = 0;
};
const toSortableTime = (value) => value ? new Date(value).getTime() : 0;
const getStoreDomain = () => process.env.SHOPIFY_STORE_DOMAIN || DEFAULT_STORE_DOMAIN;
const normalizeCollectionKey = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const getGraphQlErrorMessage = (errors, fallback = "Shopify request failed") => {
    if (!Array.isArray(errors) || errors.length === 0) {
        return fallback;
    }
    const message = errors
        .map((error) => error.message?.trim())
        .filter(Boolean)
        .join(", ");
    return message || fallback;
};
const parseNumericIdFromGid = (gid) => {
    if (typeof gid !== "string") {
        return null;
    }
    const match = gid.match(/\/(\d+)$/);
    return match?.[1] ? Number(match[1]) : null;
};
const toCollectionGid = (collectionId) => `gid://shopify/Collection/${collectionId}`;
const toProductGid = (productId) => `gid://shopify/Product/${productId}`;
const extractNextPageInfo = (linkHeader) => {
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
const fetchAllShopifyResources = async (path, responseKey) => {
    const results = [];
    let pageInfo = null;
    do {
        const params = pageInfo
            ? { limit: SHOPIFY_PAGE_LIMIT, page_info: pageInfo }
            : { limit: SHOPIFY_PAGE_LIMIT };
        const response = await shopifyHttp_1.shopifyRest.get(path, { params });
        const pageItems = Array.isArray(response.data?.[responseKey])
            ? response.data[responseKey]
            : [];
        results.push(...pageItems);
        pageInfo = extractNextPageInfo(response.headers.link);
    } while (pageInfo);
    return results;
};
const fetchAllShopifyCollectionsSummary = async () => {
    const [customCollections, smartCollections] = await Promise.all([
        fetchAllShopifyResources("/custom_collections.json", "custom_collections"),
        fetchAllShopifyResources("/smart_collections.json", "smart_collections"),
    ]);
    const storeDomain = getStoreDomain();
    return [
        ...customCollections.map((collection) => ({
            id: collection.id,
            title: collection.title ?? "Untitled Collection",
            handle: collection.handle ?? null,
            type: "custom",
            sortOrder: collection.sort_order ?? "-",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            publishedAt: collection.published_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
        ...smartCollections.map((collection) => ({
            id: collection.id,
            title: collection.title ?? "Untitled Collection",
            handle: collection.handle ?? null,
            type: "smart",
            sortOrder: collection.sort_order ?? "-",
            published: Boolean(collection.published_at),
            updatedAt: collection.updated_at ?? null,
            publishedAt: collection.published_at ?? null,
            collectionUrl: collection.handle
                ? `https://${storeDomain}/collections/${collection.handle}`
                : null,
        })),
    ];
};
const parseListMetafield = (value) => {
    if (typeof value !== "string" || value.trim() === "") {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => String(item).trim())
                .filter(Boolean);
        }
    }
    catch {
        // Fall back to treating the raw value as a single collection name.
    }
    return [value.trim()].filter(Boolean);
};
const addCollectionLookupValue = (lookup, key, collectionId) => {
    const normalizedKey = normalizeCollectionKey(key);
    if (!normalizedKey) {
        return;
    }
    const existingIds = lookup.get(normalizedKey) ?? new Set();
    existingIds.add(collectionId);
    lookup.set(normalizedKey, existingIds);
};
const extractProductCollectionNames = (product) => {
    const collectionNames = new Map();
    const defaultCollections = Array.isArray(product.collections?.nodes)
        ? product.collections.nodes
        : [];
    defaultCollections.forEach((collection) => {
        const title = typeof collection.title === "string" ? collection.title.trim() : "";
        if (!title) {
            return;
        }
        collectionNames.set(normalizeCollectionKey(title), title);
    });
    parseListMetafield(product.metafield?.value).forEach((collectionName) => {
        const normalizedName = normalizeCollectionKey(collectionName);
        if (!normalizedName || collectionNames.has(normalizedName)) {
            return;
        }
        collectionNames.set(normalizedName, collectionName);
    });
    return Array.from(collectionNames.values()).sort((left, right) => left.localeCompare(right));
};
const fetchShopifyProductMembership = async (productId) => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetShopifyProductMembership($id: ID!) {
        node(id: $id) {
          ... on Product {
            legacyResourceId
            metafield(namespace: "custom", key: "type_multiple") {
              value
            }
            collections(first: 250) {
              nodes {
                legacyResourceId
                title
                handle
              }
            }
          }
        }
      }
    `,
        variables: {
            id: toProductGid(productId),
        },
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify product collections"));
    }
    return response.data?.data?.node ?? null;
};
const setProductTypeMultipleValues = async (productId, values) => {
    const productGid = toProductGid(productId);
    if (values.length === 0) {
        const deleteResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation DeleteTypeMultipleMetafield(
          $metafields: [MetafieldIdentifierInput!]!
        ) {
          metafieldsDelete(metafields: $metafields) {
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                metafields: [
                    {
                        ownerId: productGid,
                        namespace: "custom",
                        key: "type_multiple",
                    },
                ],
            },
        });
        if (deleteResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(deleteResponse.data.errors, "Failed to clear Type Multiple collections"));
        }
        const deleteUserErrors = deleteResponse.data?.data?.metafieldsDelete?.userErrors ?? [];
        if (deleteUserErrors.length > 0) {
            throw new Error(getGraphQlErrorMessage(deleteUserErrors, "Failed to clear Type Multiple collections"));
        }
        return;
    }
    const setResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation SetTypeMultipleMetafield(
        $metafields: [MetafieldsSetInput!]!
      ) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            metafields: [
                {
                    ownerId: productGid,
                    namespace: "custom",
                    key: "type_multiple",
                    type: "list.single_line_text_field",
                    value: JSON.stringify(values),
                },
            ],
        },
    });
    if (setResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(setResponse.data.errors, "Failed to update Type Multiple collections"));
    }
    const setUserErrors = setResponse.data?.data?.metafieldsSet?.userErrors ?? [];
    if (setUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(setUserErrors, "Failed to update Type Multiple collections"));
    }
};
const syncProductCustomCollections = async ({ productId, currentCustomCollectionIds, desiredCustomCollectionIds, }) => {
    const currentCustomSet = new Set(currentCustomCollectionIds);
    const desiredCustomSet = new Set(desiredCustomCollectionIds);
    const collectionsToAdd = desiredCustomCollectionIds.filter((collectionId) => !currentCustomSet.has(collectionId));
    const collectionsToRemove = currentCustomCollectionIds.filter((collectionId) => !desiredCustomSet.has(collectionId));
    await Promise.all(collectionsToAdd.map((collectionId) => shopifyHttp_1.shopifyRest.post("/collects.json", {
        collect: {
            product_id: productId,
            collection_id: collectionId,
        },
    })));
    if (collectionsToRemove.length === 0) {
        return;
    }
    const collectsResponse = await shopifyHttp_1.shopifyRest.get("/collects.json", {
        params: {
            product_id: productId,
            limit: 250,
        },
    });
    const collects = Array.isArray(collectsResponse.data?.collects)
        ? collectsResponse.data?.collects ?? []
        : [];
    const collectIdsToDelete = collects
        .filter((collect) => collectionsToRemove.includes(collect.collection_id))
        .map((collect) => collect.id);
    await Promise.all(collectIdsToDelete.map((collectId) => shopifyHttp_1.shopifyRest.delete(`/collects/${collectId}.json`)));
};
const fetchAllShopifyProductMemberships = async () => {
    const products = [];
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query ShopifyProductsForCollections($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        nodes {
          legacyResourceId
          metafield(namespace: "custom", key: "type_multiple") {
            value
          }
          collections(first: 250) {
            nodes {
              legacyResourceId
              title
              handle
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
    while (hasNextPage) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
            query,
            variables: {
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        });
        const productsConnection = response.data?.data?.products;
        const pageProducts = Array.isArray(productsConnection?.nodes)
            ? productsConnection.nodes
            : [];
        products.push(...pageProducts);
        hasNextPage = Boolean(productsConnection?.pageInfo?.hasNextPage);
        cursor = productsConnection?.pageInfo?.endCursor ?? null;
    }
    return products;
};
const fetchAllPublications = async () => {
    const publications = [];
    let cursor = null;
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
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
            query,
            variables: {
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        });
        if (response.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify sales channels"));
        }
        const publicationsConnection = response.data?.data?.publications;
        const pagePublications = Array.isArray(publicationsConnection?.nodes)
            ? publicationsConnection.nodes
            : [];
        publications.push(...pagePublications);
        hasNextPage = Boolean(publicationsConnection?.pageInfo?.hasNextPage);
        cursor = publicationsConnection?.pageInfo?.endCursor ?? null;
    }
    return publications;
};
const publishCollectionToAllPublications = async (collectionId) => {
    const publications = await fetchAllPublications();
    if (publications.length === 0) {
        return {
            publicationCount: 0,
        };
    }
    const publishResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation PublishCollectionToAllChannels(
        $id: ID!
        $input: [PublicationInput!]!
      ) {
        publishablePublish(id: $id, input: $input) {
          userErrors {
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
    });
    if (publishResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(publishResponse.data.errors, "Collection was created but could not be published to sales channels"));
    }
    const publishUserErrors = publishResponse.data?.data?.publishablePublish?.userErrors ?? [];
    if (publishUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(publishUserErrors, "Collection was created but could not be published to sales channels"));
    }
    return {
        publicationCount: publications.length,
    };
};
const fetchPublishedPublicationIdsForCollection = async (collectionId) => {
    const publicationIds = [];
    let cursor = null;
    let hasNextPage = true;
    const query = `
    query GetPublishedCollectionPublications(
      $id: ID!
      $first: Int!
      $after: String
    ) {
      node(id: $id) {
        ... on Collection {
          resourcePublications(first: $first, after: $after) {
            nodes {
              isPublished
              publication {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;
    while (hasNextPage) {
        const response = await shopifyHttp_1.shopifyGraphQL.post("", {
            query,
            variables: {
                id: collectionId,
                first: SHOPIFY_GRAPHQL_PAGE_SIZE,
                after: cursor,
            },
        });
        if (response.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify collection publications"));
        }
        const publicationsConnection = response.data?.data?.node?.resourcePublications;
        const publicationNodes = Array.isArray(publicationsConnection?.nodes)
            ? publicationsConnection.nodes
            : [];
        publicationNodes.forEach((publicationNode) => {
            if (publicationNode.isPublished && publicationNode.publication?.id) {
                publicationIds.push(publicationNode.publication.id);
            }
        });
        hasNextPage = Boolean(publicationsConnection?.pageInfo?.hasNextPage);
        cursor = publicationsConnection?.pageInfo?.endCursor ?? null;
    }
    return [...new Set(publicationIds)];
};
const unpublishCollectionFromAllPublications = async (collectionId) => {
    const publicationIds = await fetchPublishedPublicationIdsForCollection(collectionId);
    if (publicationIds.length === 0) {
        return {
            publicationCount: 0,
        };
    }
    const unpublishResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation UnpublishCollectionFromAllChannels(
        $id: ID!
        $input: [PublicationInput!]!
      ) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors {
            message
          }
        }
      }
    `,
        variables: {
            id: collectionId,
            input: publicationIds.map((publicationId) => ({
                publicationId,
            })),
        },
    });
    if (unpublishResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(unpublishResponse.data.errors, "Failed to unpublish Shopify collection from sales channels"));
    }
    const unpublishUserErrors = unpublishResponse.data?.data?.publishableUnpublish?.userErrors ?? [];
    if (unpublishUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(unpublishUserErrors, "Failed to unpublish Shopify collection from sales channels"));
    }
    return {
        publicationCount: publicationIds.length,
    };
};
const fetchTypeMultipleMetafieldDefinition = async () => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetTypeMultipleMetafieldDefinition(
        $identifier: MetafieldDefinitionIdentifierInput!
      ) {
        metafieldDefinition(identifier: $identifier) {
          id
          name
          namespace
          key
          type {
            name
          }
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
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load the Type Multiple metafield definition"));
    }
    return response.data?.data?.metafieldDefinition ?? null;
};
const fetchCollectionById = async (collectionGid) => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      query GetCollectionForDelete($id: ID!) {
        node(id: $id) {
          ... on Collection {
            id
            title
            handle
          }
        }
      }
    `,
        variables: {
            id: collectionGid,
        },
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors, "Failed to load Shopify collection details"));
    }
    return response.data?.data?.node ?? null;
};
const ensureTypeMultipleSmartCollectionDefinition = async () => {
    const existingDefinition = await fetchTypeMultipleMetafieldDefinition();
    if (existingDefinition?.capabilities?.smartCollectionCondition?.enabled) {
        return existingDefinition;
    }
    if (!existingDefinition) {
        const createResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation CreateTypeMultipleMetafieldDefinition(
          $definition: MetafieldDefinitionInput!
        ) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              name
              namespace
              key
              type {
                name
              }
              capabilities {
                smartCollectionCondition {
                  enabled
                }
              }
            }
            userErrors {
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
        });
        if (createResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(createResponse.data.errors, "Failed to create the Type Multiple metafield definition"));
        }
        const createPayload = createResponse.data?.data?.metafieldDefinitionCreate;
        const createUserErrors = createPayload?.userErrors ?? [];
        if (createUserErrors.length > 0) {
            throw new Error(getGraphQlErrorMessage(createUserErrors, "Failed to enable Type Multiple as a smart collection condition"));
        }
        if (!createPayload?.createdDefinition) {
            throw new Error("Shopify did not return the created Type Multiple metafield definition");
        }
        return createPayload.createdDefinition;
    }
    const updateResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
        query: `
      mutation UpdateTypeMultipleMetafieldDefinition(
        $definition: MetafieldDefinitionUpdateInput!
      ) {
        metafieldDefinitionUpdate(definition: $definition) {
          updatedDefinition {
            id
            name
            namespace
            key
            type {
              name
            }
            capabilities {
              smartCollectionCondition {
                enabled
              }
            }
          }
          userErrors {
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
    });
    if (updateResponse.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(updateResponse.data.errors, "Failed to update the Type Multiple metafield definition"));
    }
    const updatePayload = updateResponse.data?.data?.metafieldDefinitionUpdate;
    const updateUserErrors = updatePayload?.userErrors ?? [];
    if (updateUserErrors.length > 0) {
        throw new Error(getGraphQlErrorMessage(updateUserErrors, "Failed to enable Type Multiple as a smart collection condition"));
    }
    if (!updatePayload?.updatedDefinition) {
        throw new Error("Shopify did not return the updated Type Multiple metafield definition");
    }
    return updatePayload.updatedDefinition;
};
router.get("/products", async (_req, res) => {
    try {
        if (isShopifyProductsCacheFresh()) {
            return res.json(cachedShopifyProductsResponse);
        }
        const [shopifyProducts, productMemberships, allCollections] = await Promise.all([
            fetchAllShopifyResources("/products.json", "products"),
            fetchAllShopifyProductMemberships(),
            fetchAllShopifyCollectionsSummary(),
        ]);
        const storeDomain = getStoreDomain();
        const productMembershipMap = new Map();
        const collectionById = new Map();
        const smartCollectionIdsByTitle = new Map();
        allCollections.forEach((collection) => {
            collectionById.set(collection.id, collection);
            if (collection.type === "smart") {
                const normalizedTitle = normalizeCollectionKey(collection.title);
                if (!normalizedTitle) {
                    return;
                }
                const existingTitleIds = smartCollectionIdsByTitle.get(normalizedTitle) ?? [];
                smartCollectionIdsByTitle.set(normalizedTitle, [
                    ...existingTitleIds,
                    collection.id,
                ]);
            }
        });
        productMemberships.forEach((product) => {
            const productId = product.legacyResourceId !== undefined &&
                product.legacyResourceId !== null
                ? String(product.legacyResourceId)
                : "";
            if (!productId) {
                return;
            }
            productMembershipMap.set(productId, product);
        });
        const data = shopifyProducts
            .map((product) => {
            const productMembership = productMembershipMap.get(String(product.id));
            const tags = product.tags
                ? product.tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                : [];
            return {
                id: String(product.id),
                shopifyProductId: product.id,
                title: product.title ?? "Untitled Product",
                handle: product.handle ?? null,
                vendor: product.vendor?.trim() || "Unknown Vendor",
                editableCollectionIds: productMembership
                    ? [
                        ...new Set([
                            ...(Array.isArray(productMembership.collections?.nodes)
                                ? productMembership.collections.nodes
                                    .map((collection) => Number(collection.legacyResourceId))
                                    .filter((collectionId) => !Number.isNaN(collectionId) &&
                                    collectionById.has(collectionId))
                                : []),
                            ...parseListMetafield(productMembership.metafield?.value)
                                .flatMap((collectionName) => smartCollectionIdsByTitle.get(normalizeCollectionKey(collectionName)) ?? [])
                                .filter((collectionId) => collectionById.has(collectionId)),
                        ]),
                    ].sort((left, right) => left - right)
                    : [],
                collectionNames: productMembership
                    ? extractProductCollectionNames(productMembership)
                    : [],
                tags,
                productUrl: product.handle
                    ? `https://${storeDomain}/products/${product.handle}`
                    : null,
                updatedAt: product.updated_at ?? null,
            };
        })
            .sort((left, right) => toSortableTime(right.updatedAt) -
            toSortableTime(left.updatedAt));
        const responsePayload = {
            success: true,
            count: data.length,
            data,
        };
        cachedShopifyProductsResponse = responsePayload;
        cachedShopifyProductsFetchedAt = Date.now();
        res.json(responsePayload);
    }
    catch (error) {
        console.error("Shopify products fetch error:", error);
        if (cachedShopifyProductsResponse) {
            return res.json(cachedShopifyProductsResponse);
        }
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch Shopify products",
        });
    }
});
router.get("/collections", async (_req, res) => {
    try {
        if (isShopifyCollectionsCacheFresh()) {
            return res.json(cachedShopifyCollectionsResponse);
        }
        const [collections, productMemberships] = await Promise.all([
            fetchAllShopifyCollectionsSummary(),
            fetchAllShopifyProductMemberships(),
        ]);
        const collectionLookup = new Map();
        const smartCollectionTitleLookup = new Map();
        const collectionCounts = new Map();
        collections.forEach((collection) => {
            collectionCounts.set(collection.id, 0);
            addCollectionLookupValue(collectionLookup, collection.title, collection.id);
            addCollectionLookupValue(collectionLookup, collection.handle, collection.id);
            if (collection.type === "smart") {
                addCollectionLookupValue(smartCollectionTitleLookup, collection.title, collection.id);
            }
        });
        productMemberships.forEach((product) => {
            const matchedCollectionIds = new Set();
            const defaultCollections = Array.isArray(product.collections?.nodes)
                ? product.collections.nodes
                : [];
            defaultCollections.forEach((collection) => {
                const resourceId = Number(collection.legacyResourceId);
                if (!Number.isNaN(resourceId) && collectionCounts.has(resourceId)) {
                    matchedCollectionIds.add(resourceId);
                }
                const byTitle = collectionLookup.get(normalizeCollectionKey(collection.title));
                const byHandle = collectionLookup.get(normalizeCollectionKey(collection.handle));
                byTitle?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
                byHandle?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
            });
            parseListMetafield(product.metafield?.value).forEach((collectionName) => {
                const matchedIds = smartCollectionTitleLookup.get(normalizeCollectionKey(collectionName));
                matchedIds?.forEach((collectionId) => matchedCollectionIds.add(collectionId));
            });
            matchedCollectionIds.forEach((collectionId) => {
                collectionCounts.set(collectionId, (collectionCounts.get(collectionId) ?? 0) + 1);
            });
        });
        const data = collections
            .map((collection) => ({
            ...collection,
            productCount: collectionCounts.get(collection.id) ?? 0,
        }))
            .sort((left, right) => toSortableTime(right.updatedAt) -
            toSortableTime(left.updatedAt));
        const responsePayload = {
            success: true,
            count: data.length,
            data,
        };
        cachedShopifyCollectionsResponse = responsePayload;
        cachedShopifyCollectionsFetchedAt = Date.now();
        res.json(responsePayload);
    }
    catch (error) {
        console.error("Shopify collections fetch error:", error);
        if (cachedShopifyCollectionsResponse) {
            return res.json(cachedShopifyCollectionsResponse);
        }
        res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch Shopify collections",
        });
    }
});
router.post("/collections", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const ruleValueInput = typeof req.body?.ruleValue === "string"
        ? req.body.ruleValue.trim()
        : "";
    const descriptionHtml = typeof req.body?.descriptionHtml === "string"
        ? req.body.descriptionHtml.trim()
        : "";
    if (!title) {
        return res.status(400).json({
            success: false,
            message: "Collection name is required",
        });
    }
    const ruleValue = ruleValueInput || title;
    try {
        const metafieldDefinition = await ensureTypeMultipleSmartCollectionDefinition();
        const createCollectionResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation CreateSmartCollection($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection {
              id
              title
              handle
              sortOrder
              updatedAt
              ruleSet {
                appliedDisjunctively
              }
            }
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                input: {
                    title,
                    ...(descriptionHtml ? { descriptionHtml } : {}),
                    ruleSet: {
                        appliedDisjunctively: true,
                        rules: [
                            {
                                column: "PRODUCT_METAFIELD_DEFINITION",
                                relation: "EQUALS",
                                condition: ruleValue,
                                conditionObjectId: metafieldDefinition.id,
                            },
                        ],
                    },
                },
            },
        });
        if (createCollectionResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(createCollectionResponse.data.errors, "Failed to create Shopify collection"));
        }
        const createPayload = createCollectionResponse.data?.data?.collectionCreate;
        const createUserErrors = createPayload?.userErrors ?? [];
        if (createUserErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: getGraphQlErrorMessage(createUserErrors, "Failed to create Shopify collection"),
            });
        }
        if (!createPayload?.collection) {
            throw new Error("Shopify did not return the created collection");
        }
        const publishResult = await publishCollectionToAllPublications(createPayload.collection.id ?? "");
        clearShopifyCollectionsCache();
        return res.status(201).json({
            success: true,
            message: publishResult.publicationCount > 0
                ? `Shopify collection created and published to ${publishResult.publicationCount} sales channel${publishResult.publicationCount === 1 ? "" : "s"}`
                : "Shopify collection created successfully",
            data: {
                id: parseNumericIdFromGid(createPayload.collection.id),
                title: createPayload.collection.title ?? title,
                handle: createPayload.collection.handle ?? null,
                type: "smart",
                sortOrder: createPayload.collection.sortOrder ?? "-",
                productCount: 0,
                published: publishResult.publicationCount > 0,
                publishedAt: publishResult.publicationCount > 0
                    ? new Date().toISOString()
                    : null,
                updatedAt: createPayload.collection.updatedAt ?? null,
                ruleValue,
                publicationCount: publishResult.publicationCount,
                collectionUrl: createPayload.collection.handle
                    ? `https://${getStoreDomain()}/collections/${createPayload.collection.handle}`
                    : null,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection create error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create Shopify collection",
        });
    }
});
router.patch("/collections/:id/publish", async (req, res) => {
    const rawCollectionId = req.params.id;
    const collectionId = Number(rawCollectionId);
    const published = typeof req.body?.published === "boolean" ? req.body.published : null;
    if (!rawCollectionId || Number.isNaN(collectionId)) {
        return res.status(400).json({
            success: false,
            message: "Valid collection ID is required",
        });
    }
    if (published === null) {
        return res.status(400).json({
            success: false,
            message: "Publish state is required",
        });
    }
    try {
        const collectionGid = toCollectionGid(collectionId);
        const [existingCollection, currentCollections] = await Promise.all([
            fetchCollectionById(collectionGid),
            fetchAllShopifyCollectionsSummary(),
        ]);
        if (!existingCollection?.id || !existingCollection.title) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        const currentCollection = currentCollections.find((collection) => collection.id === collectionId);
        if (!currentCollection) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        if (currentCollection.published === published) {
            return res.json({
                success: true,
                message: published
                    ? `Collection "${currentCollection.title}" is already published`
                    : `Collection "${currentCollection.title}" is already unpublished`,
                data: currentCollection,
            });
        }
        const publicationResult = published
            ? await publishCollectionToAllPublications(collectionGid)
            : await unpublishCollectionFromAllPublications(collectionGid);
        clearShopifyCollectionsCache();
        const refreshedCollection = (await fetchAllShopifyCollectionsSummary()).find((collection) => collection.id === collectionId);
        return res.json({
            success: true,
            message: published
                ? `Collection "${existingCollection.title}" published to ${publicationResult.publicationCount} sales channel${publicationResult.publicationCount === 1 ? "" : "s"}`
                : `Collection "${existingCollection.title}" unpublished from ${publicationResult.publicationCount} sales channel${publicationResult.publicationCount === 1 ? "" : "s"}`,
            data: {
                ...(refreshedCollection ?? currentCollection),
                publicationCount: publicationResult.publicationCount,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection publish update error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update Shopify collection publish state",
        });
    }
});
router.patch("/products/:id/collections", async (req, res) => {
    const rawProductId = req.params.id;
    const productId = Number(rawProductId);
    const selectedCollectionIds = Array.isArray(req.body?.selectedCollectionIds)
        ? req.body.selectedCollectionIds
            .map((collectionId) => Number(collectionId))
            .filter((collectionId) => !Number.isNaN(collectionId))
        : [];
    if (!rawProductId || Number.isNaN(productId)) {
        return res.status(400).json({
            success: false,
            message: "Valid product ID is required",
        });
    }
    try {
        const [productMembership, allCollections] = await Promise.all([
            fetchShopifyProductMembership(productId),
            fetchAllShopifyCollectionsSummary(),
        ]);
        if (!productMembership?.legacyResourceId) {
            return res.status(404).json({
                success: false,
                message: "Product not found in Shopify",
            });
        }
        const collectionById = new Map(allCollections.map((collection) => [collection.id, collection]));
        const smartCollectionsByTitle = new Map();
        allCollections
            .filter((collection) => collection.type === "smart")
            .forEach((collection) => {
            smartCollectionsByTitle.set(normalizeCollectionKey(collection.title), collection);
        });
        const invalidCollectionId = selectedCollectionIds.find((collectionId) => !collectionById.has(collectionId));
        if (invalidCollectionId) {
            return res.status(400).json({
                success: false,
                message: `Collection ${invalidCollectionId} is not a valid Shopify collection`,
            });
        }
        const desiredCollections = selectedCollectionIds
            .map((collectionId) => collectionById.get(collectionId))
            .filter((collection) => Boolean(collection));
        const desiredCustomCollectionIds = desiredCollections
            .filter((collection) => collection.type === "custom")
            .map((collection) => collection.id);
        const desiredSmartValues = desiredCollections
            .filter((collection) => collection.type === "smart")
            .map((collection) => collection.title);
        const currentCollections = Array.isArray(productMembership.collections?.nodes)
            ? productMembership.collections.nodes
            : [];
        const currentCustomCollectionIds = currentCollections
            .map((collection) => Number(collection.legacyResourceId))
            .filter((collectionId) => {
            if (Number.isNaN(collectionId)) {
                return false;
            }
            return collectionById.get(collectionId)?.type === "custom";
        });
        const currentTypeMultipleValues = parseListMetafield(productMembership.metafield?.value);
        const preservedSmartValues = currentTypeMultipleValues.filter((value) => {
            const matchedCollection = smartCollectionsByTitle.get(normalizeCollectionKey(value));
            return !matchedCollection;
        });
        const nextTypeMultipleValues = [
            ...new Set([
                ...preservedSmartValues,
                ...desiredSmartValues,
            ]),
        ];
        await Promise.all([
            syncProductCustomCollections({
                productId,
                currentCustomCollectionIds,
                desiredCustomCollectionIds,
            }),
            setProductTypeMultipleValues(productId, nextTypeMultipleValues),
        ]);
        clearShopifyProductsCache();
        clearShopifyCollectionsCache();
        const refreshedMembership = await fetchShopifyProductMembership(productId);
        const refreshedCollectionNames = refreshedMembership
            ? extractProductCollectionNames(refreshedMembership)
            : [];
        return res.json({
            success: true,
            message: "Product collections updated in Shopify",
            data: {
                productId,
                collectionNames: refreshedCollectionNames,
                selectedCollectionIds: selectedCollectionIds.sort((left, right) => left - right),
            },
        });
    }
    catch (error) {
        console.error("Shopify product collection update error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update Shopify product collections",
        });
    }
});
router.delete("/collections/:id", async (req, res) => {
    const rawCollectionId = req.params.id;
    const collectionId = Number(rawCollectionId);
    const confirmationName = typeof req.body?.confirmationName === "string"
        ? req.body.confirmationName.trim()
        : "";
    if (!rawCollectionId || Number.isNaN(collectionId)) {
        return res.status(400).json({
            success: false,
            message: "Valid collection ID is required",
        });
    }
    if (!confirmationName) {
        return res.status(400).json({
            success: false,
            message: "Collection name confirmation is required",
        });
    }
    try {
        const collectionGid = toCollectionGid(collectionId);
        const existingCollection = await fetchCollectionById(collectionGid);
        if (!existingCollection?.id || !existingCollection.title) {
            return res.status(404).json({
                success: false,
                message: "Collection not found in Shopify",
            });
        }
        if (confirmationName !== existingCollection.title) {
            return res.status(400).json({
                success: false,
                message: "Typed collection name does not match exactly",
            });
        }
        const deleteResponse = await shopifyHttp_1.shopifyGraphQL.post("", {
            query: `
        mutation DeleteCollection($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors {
              message
            }
          }
        }
      `,
            variables: {
                input: {
                    id: collectionGid,
                },
            },
        });
        if (deleteResponse.data?.errors?.length) {
            throw new Error(getGraphQlErrorMessage(deleteResponse.data.errors, "Failed to delete Shopify collection"));
        }
        const deletePayload = deleteResponse.data?.data?.collectionDelete;
        const deleteUserErrors = deletePayload?.userErrors ?? [];
        if (deleteUserErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: getGraphQlErrorMessage(deleteUserErrors, "Failed to delete Shopify collection"),
            });
        }
        if (!deletePayload?.deletedCollectionId) {
            throw new Error("Shopify did not confirm the collection deletion");
        }
        clearShopifyCollectionsCache();
        return res.json({
            success: true,
            message: `Collection "${existingCollection.title}" deleted from Shopify`,
            data: {
                id: collectionId,
                title: existingCollection.title,
            },
        });
    }
    catch (error) {
        console.error("Shopify collection delete error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete Shopify collection",
        });
    }
});
exports.default = router;
