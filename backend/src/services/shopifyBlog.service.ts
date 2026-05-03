import axios from "axios";
import FormData from "form-data";
import { shopifyClient } from "./shopifyClient";

type ShopifyBlogRecord = {
  id: number;
  title: string;
  handle: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ShopifyCollectionContextRecord = {
  id: number;
  title: string;
  handle: string | null;
  url: string | null;
  updatedAt: string | null;
};

export type ShopifyProductContextRecord = {
  id: number;
  title: string;
  handle: string | null;
  url: string | null;
  category: string;
  vendor: string;
  price: string | null;
  tags: string[];
  description: string;
  useCase: string;
  collectionTitles: string[];
  collectionHandles: string[];
};

export type ShopifyCatalogContext = {
  primaryCollection: ShopifyCollectionContextRecord | null;
  collections: ShopifyCollectionContextRecord[];
  products: ShopifyProductContextRecord[];
  productsCsv: string;
  collectionsCsv: string;
  collectionContextFailed?: boolean;
  productContextFailed?: boolean;
  collectionContextError?: string | null;
  productContextError?: string | null;
};

type ShopifyArticleResult = {
  articleId: number;
  blogId: number;
  handle: string | null;
  url: string | null;
  publishedAt: string | null;
};

type UploadedShopifyFile = {
  url: string;
  originalSourceUrl: string | null;
};

const SHOPIFY_STORE_DOMAIN = String(process.env.SHOPIFY_STORE_DOMAIN ?? "").replace(
  /^https?:\/\//i,
  ""
);

const stripHtml = (value: string) =>
  value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

const normalizeValue = (value: string | null | undefined) =>
  typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";

const csvEscape = (value: string | number | null | undefined) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const buildStoreUrl = (path: string | null | undefined) =>
  path && SHOPIFY_STORE_DOMAIN ? `https://${SHOPIFY_STORE_DOMAIN}${path}` : null;

const buildCollectionUrl = (handle: string | null | undefined) =>
  handle ? buildStoreUrl(`/collections/${handle}`) : null;

const buildProductUrl = (handle: string | null | undefined) =>
  handle ? buildStoreUrl(`/products/${handle}`) : null;

const scoreCategoryMatch = (
  needle: string | null | undefined,
  haystack: string | null | undefined
) => {
  const normalizedNeedle = normalizeValue(needle);
  const normalizedHaystack = normalizeValue(haystack);

  if (!normalizedNeedle || !normalizedHaystack) {
    return 0;
  }

  if (normalizedNeedle === normalizedHaystack) {
    return 4;
  }

  if (normalizedHaystack.includes(normalizedNeedle)) {
    return 3;
  }

  const needleTokens = normalizedNeedle.split(" ").filter(Boolean);
  const matchedTokens = needleTokens.filter((token) =>
    normalizedHaystack.includes(token)
  );

  return matchedTokens.length > 0 ? Math.min(2, matchedTokens.length) : 0;
};

const scoreKeywordOverlap = (source: string, candidate: string) => {
  const sourceTokens = tokenize(source);
  const candidateTokens = new Set(tokenize(candidate));

  let score = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) {
      score += 1;
    }
  }

  return score;
};

const inferExtension = (mimeType: string, fallback = "png") => {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("gif")) {
    return "gif";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("svg")) {
    return "svg";
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  return fallback;
};

const graphqlRequest = async <T>(query: string, variables?: Record<string, unknown>) => {
  const response = await shopifyClient.post<T>("/graphql.json", {
    query,
    variables,
  });

  return response.data;
};

const decodeImageSource = async (sourceUrl: string) => {
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Unsupported data URL image format");
    }

    return {
      buffer: Buffer.from(match[2], "base64"),
      mimeType: match[1] || "image/png",
      filename: `blog-image-${Date.now()}.${inferExtension(match[1] || "image/png")}`,
    };
  }

  const response = await axios.get<ArrayBuffer>(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
  });
  const contentType = String(response.headers["content-type"] ?? "image/png");
  const pathname = (() => {
    try {
      return new URL(sourceUrl).pathname;
    } catch (_error) {
      return "";
    }
  })();
  const extensionMatch = pathname.match(/\.([a-z0-9]+)$/i);
  const extension = extensionMatch?.[1] ?? inferExtension(contentType);

  return {
    buffer: Buffer.from(response.data),
    mimeType: contentType,
    filename: `blog-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`,
  };
};

const createStagedUploadTarget = async (params: {
  filename: string;
  mimeType: string;
  fileSize: number;
}) => {
  const data = await graphqlRequest<{
    data?: {
      stagedUploadsCreate?: {
        stagedTargets?: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  }>(
    `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: [
        {
          filename: params.filename,
          mimeType: params.mimeType,
          httpMethod: "POST",
          resource: "IMAGE",
          fileSize: String(params.fileSize),
        },
      ],
    }
  );

  const stagedUploads = data.data?.stagedUploadsCreate;
  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  if (stagedUploads?.userErrors?.length) {
    throw new Error(stagedUploads.userErrors[0].message);
  }

  const target = stagedUploads?.stagedTargets?.[0];
  if (!target) {
    throw new Error("Shopify staged upload target was not returned");
  }

  return target;
};

const uploadBufferToStagedTarget = async (params: {
  url: string;
  parameters: Array<{ name: string; value: string }>;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) => {
  const form = new FormData();

  params.parameters.forEach((parameter) => {
    form.append(parameter.name, parameter.value);
  });

  form.append("file", params.buffer, {
    filename: params.filename,
    contentType: params.mimeType,
  });

  await axios.post(params.url, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
  });
};

const createShopifyFile = async (params: {
  originalSource: string;
  filename: string;
  alt: string;
}) => {
  const data = await graphqlRequest<{
    data?: {
      fileCreate?: {
        files?: Array<{
          id: string;
          fileStatus?: string;
          preview?: {
            image?: {
              url?: string;
            } | null;
          } | null;
          image?: {
            url?: string;
          } | null;
        }>;
        userErrors?: Array<{ field?: string[]; message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  }>(
    `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image {
                url
              }
              preview {
                image {
                  url
                }
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
    {
      files: [
        {
          alt: params.alt,
          contentType: "IMAGE",
          filename: params.filename,
          originalSource: params.originalSource,
        },
      ],
    }
  );

  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  if (data.data?.fileCreate?.userErrors?.length) {
    throw new Error(data.data.fileCreate.userErrors[0].message);
  }

  const file = data.data?.fileCreate?.files?.[0];
  if (!file?.id) {
    throw new Error("Shopify file creation returned no file id");
  }

  return file.id;
};

const waitForShopifyFileUrl = async (fileId: string) => {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const data = await graphqlRequest<{
      data?: {
        node?: {
          __typename?: string;
          fileStatus?: string;
          image?: { url?: string } | null;
          preview?: { image?: { url?: string } | null } | null;
          originalSource?: { url?: string } | null;
        } | null;
      };
      errors?: Array<{ message: string }>;
    }>(
      `
        query fileNode($id: ID!) {
          node(id: $id) {
            __typename
            ... on MediaImage {
              fileStatus
              image {
                url
              }
              preview {
                image {
                  url
                }
              }
              originalSource {
                url
              }
            }
          }
        }
      `,
      { id: fileId }
    );

    if (data.errors?.length) {
      throw new Error(data.errors[0].message);
    }

    const node = data.data?.node;
    const imageUrl =
      node?.image?.url ?? node?.preview?.image?.url ?? node?.originalSource?.url ?? null;

    if (imageUrl) {
      return {
        url: imageUrl,
        originalSourceUrl: node?.originalSource?.url ?? null,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Shopify file upload did not become ready in time");
};

const listShopifyCollectionsForContext = async (
  limit = 10
): Promise<ShopifyCollectionContextRecord[]> => {
  const data = await graphqlRequest<{
    data?: {
      collections?: {
        nodes?: Array<{
          legacyResourceId?: string | number | null;
          title?: string;
          handle?: string | null;
          description?: string | null;
          updatedAt?: string | null;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  }>(
    `
      query BlogCollections($first: Int!) {
        collections(first: $first, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            legacyResourceId
            title
            handle
            description
            updatedAt
          }
        }
      }
    `,
    {
      first: Math.max(1, Math.min(50, limit)),
    }
  );

  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  const nodes = Array.isArray(data.data?.collections?.nodes)
    ? data.data?.collections?.nodes
    : [];

  return nodes
    .map((node) => ({
      id: Number(node?.legacyResourceId ?? 0),
      title: String(node?.title ?? "").trim(),
      handle: typeof node?.handle === "string" ? node.handle : null,
      url: buildCollectionUrl(typeof node?.handle === "string" ? node.handle : null),
      updatedAt:
        typeof node?.updatedAt === "string" ? node.updatedAt : null,
    }))
    .filter(
      (entry: ShopifyCollectionContextRecord) =>
        entry.id > 0 && Boolean(entry.title)
    );
};

const listShopifyProductsForContext = async (
  limit = 20
): Promise<ShopifyProductContextRecord[]> => {
  const response = await shopifyClient.get("/products.json", {
    params: {
      limit: Math.max(1, Math.min(50, limit * 2)),
      fields:
        "id,title,handle,product_type,vendor,tags,body_html,variants,updated_at",
      status: "active",
    },
  });

  const products = Array.isArray(response.data?.products)
    ? response.data.products
    : [];

  return products
    .map((product: Record<string, unknown>) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const firstVariant =
        variants.find(
          (variant) =>
            variant &&
            typeof variant === "object" &&
            "price" in (variant as Record<string, unknown>)
        ) ?? null;
      const rawPrice =
        firstVariant &&
        typeof firstVariant === "object" &&
        "price" in (firstVariant as Record<string, unknown>)
          ? (firstVariant as Record<string, unknown>).price
          : null;

      return {
        id: Number(product.id ?? 0),
        title: String(product.title ?? "").trim(),
        handle: typeof product.handle === "string" ? product.handle : null,
        url: buildProductUrl(
          typeof product.handle === "string" ? product.handle : null
        ),
        category: String(product.product_type ?? "").trim(),
        vendor: String(product.vendor ?? "").trim(),
        price:
          rawPrice == null || rawPrice === ""
            ? null
            : String(rawPrice).trim(),
        tags: String(product.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        description: stripHtml(String(product.body_html ?? "")).slice(0, 400),
        useCase: stripHtml(String(product.body_html ?? ""))
          .split(/[.!?]/)
          .map((part) => part.trim())
          .find(Boolean) ?? "",
        collectionTitles: [],
        collectionHandles: [],
      };
    })
    .filter(
      (entry: ShopifyProductContextRecord) => entry.id > 0 && Boolean(entry.title)
    );
};

export const loadShopifyCatalogContext = async (
  category: string,
  options?: {
    topic?: string;
    productLimit?: number;
    collectionLimit?: number;
  }
): Promise<ShopifyCatalogContext> => {
  const collectionLimit = Math.max(1, Math.min(20, options?.collectionLimit ?? 10));
  const productLimit = Math.max(1, Math.min(50, options?.productLimit ?? 20));
  const topic = String(options?.topic ?? "").trim();
  const [collectionsResult, productsResult] = await Promise.allSettled([
    listShopifyCollectionsForContext(collectionLimit),
    listShopifyProductsForContext(productLimit),
  ]);
  const collections =
    collectionsResult.status === "fulfilled" ? collectionsResult.value : [];
  const products =
    productsResult.status === "fulfilled" ? productsResult.value : [];

  const scoredCollections = collections
    .map((collection) => ({
      collection,
      score: Math.max(
        scoreCategoryMatch(category, collection.title),
        scoreCategoryMatch(category, collection.handle)
      ),
    }))
    .sort((left, right) => right.score - left.score);

  const primaryCollection = scoredCollections[0]?.score
    ? scoredCollections[0].collection
    : null;

  const matchedCollections = (
    primaryCollection
      ? scoredCollections.filter((entry) => entry.score > 0).map((entry) => entry.collection)
      : collections
  ).slice(0, collectionLimit);

  const matchedProducts = products
    .map((product) => {
      const categoryScore = Math.max(
        scoreCategoryMatch(category, product.category),
        scoreCategoryMatch(category, product.title),
        scoreCategoryMatch(category, product.vendor),
        scoreCategoryMatch(category, product.description),
        ...product.tags.map((tag) => scoreCategoryMatch(category, tag))
      );
      const topicScore = topic
        ? Math.max(
            scoreKeywordOverlap(topic, product.title),
            scoreKeywordOverlap(topic, product.category),
            scoreKeywordOverlap(topic, product.vendor),
            scoreKeywordOverlap(topic, product.description),
            ...product.tags.map((tag) => scoreKeywordOverlap(topic, tag))
          )
        : 0;
      const broaderCollectionScore = Math.max(
        ...matchedCollections.map((collection) =>
          Math.max(
            scoreCategoryMatch(collection.title, product.category),
            scoreCategoryMatch(collection.handle, product.category),
            scoreKeywordOverlap(collection.title, product.title),
            scoreKeywordOverlap(collection.title, product.description)
          )
        ),
        0
      );

      return {
        product,
        score: categoryScore * 3 + topicScore * 2 + broaderCollectionScore,
      };
    })
    .filter((entry) => entry.score > 0 || products.length <= productLimit)
    .sort((left, right) => right.score - left.score)
    .slice(0, productLimit)
    .map((entry) => entry.product);

  const collectionRows = (matchedCollections.length > 0
    ? matchedCollections
    : collections.slice(0, collectionLimit)
  ).slice(0, collectionLimit);
  const productRows =
    matchedProducts.length > 0
      ? matchedProducts.slice(0, Math.min(6, productLimit))
      : products.slice(0, Math.min(6, productLimit));

  const collectionsCsv = [
    "id,title,handle,url",
    ...collectionRows.map((collection) =>
      [
        csvEscape(collection.id),
        csvEscape(collection.title),
        csvEscape(collection.handle),
        csvEscape(collection.url),
      ].join(",")
    ),
  ].join("\n");

  const productsCsv = [
    "id,title,handle,url,category,price",
    ...productRows.map((product) =>
      [
        csvEscape(product.id),
        csvEscape(product.title),
        csvEscape(product.handle),
        csvEscape(product.url),
        csvEscape(product.category),
        csvEscape(product.price),
      ].join(",")
    ),
  ].join("\n");

  return {
    primaryCollection,
    collections: collectionRows,
    products: productRows,
    productsCsv,
    collectionsCsv,
    collectionContextFailed: collectionsResult.status === "rejected",
    productContextFailed: productsResult.status === "rejected",
    collectionContextError:
      collectionsResult.status === "rejected"
        ? collectionsResult.reason instanceof Error
          ? collectionsResult.reason.message
          : String(collectionsResult.reason)
        : null,
    productContextError:
      productsResult.status === "rejected"
        ? productsResult.reason instanceof Error
          ? productsResult.reason.message
          : String(productsResult.reason)
        : null,
  };
};

export const uploadImageToShopifyFiles = async (params: {
  sourceUrl: string;
  alt: string;
}) : Promise<UploadedShopifyFile> => {
  const decoded = await decodeImageSource(params.sourceUrl);
  const stagedTarget = await createStagedUploadTarget({
    filename: decoded.filename,
    mimeType: decoded.mimeType,
    fileSize: decoded.buffer.length,
  });

  await uploadBufferToStagedTarget({
    url: stagedTarget.url,
    parameters: stagedTarget.parameters,
    buffer: decoded.buffer,
    filename: decoded.filename,
    mimeType: decoded.mimeType,
  });

  const fileId = await createShopifyFile({
    originalSource: stagedTarget.resourceUrl,
    filename: decoded.filename,
    alt: params.alt,
  });

  return waitForShopifyFileUrl(fileId);
};

export const listShopifyBlogs = async (): Promise<ShopifyBlogRecord[]> => {
  const response = await shopifyClient.get("/blogs.json", {
    params: {
      limit: 250,
      fields: "id,title,handle,created_at,updated_at",
    },
  });

  const blogs = Array.isArray(response.data?.blogs) ? response.data.blogs : [];

  return blogs.map((blog: Record<string, unknown>) => ({
    id: Number(blog.id),
    title: String(blog.title ?? ""),
    handle: String(blog.handle ?? ""),
    createdAt: typeof blog.created_at === "string" ? blog.created_at : null,
    updatedAt: typeof blog.updated_at === "string" ? blog.updated_at : null,
  }));
};

export const createArticleForShopifyBlog = async (params: {
  blogId: number;
  blogHandle?: string | null;
  title: string;
  author: string;
  tags: string[];
  excerpt: string;
  contentHtml: string;
  publish: boolean;
}) : Promise<ShopifyArticleResult> => {
  const createPayload = async (summaryHtml?: string | null) => {
    const articlePayload: Record<string, unknown> = {
      title: params.title.trim(),
      author: params.author,
      body_html: params.contentHtml,
      tags: params.tags.filter(Boolean).join(", "),
      published: params.publish,
    };

    if (summaryHtml) {
      articlePayload.summary_html = summaryHtml;
    }

    return shopifyClient.post(`/blogs/${params.blogId}/articles.json`, {
      article: articlePayload,
    });
  };

  try {
    const response = await createPayload(params.excerpt ? params.excerpt.trim() : null);
    const article = response.data?.article as Record<string, unknown> | undefined;

    if (!article) {
      throw new Error("Shopify article response was empty");
    }

    return {
      articleId: Number(article.id),
      blogId: Number(article.blog_id ?? params.blogId),
      handle: typeof article.handle === "string" ? article.handle : null,
      url:
        params.blogHandle &&
        typeof article.handle === "string" &&
        SHOPIFY_STORE_DOMAIN
          ? `https://${SHOPIFY_STORE_DOMAIN}/blogs/${params.blogHandle}/${article.handle}`
          : null,
      publishedAt: typeof article.published_at === "string" ? article.published_at : null,
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : null;
    if (status === 422) {
      const response = await createPayload(
        params.excerpt ? stripHtml(params.excerpt).slice(0, 280) : null
      );
      const article = response.data?.article as Record<string, unknown> | undefined;

      if (!article) {
        throw new Error("Shopify article response was empty");
      }

      return {
        articleId: Number(article.id),
        blogId: Number(article.blog_id ?? params.blogId),
        handle: typeof article.handle === "string" ? article.handle : null,
        url:
          params.blogHandle &&
          typeof article.handle === "string" &&
          SHOPIFY_STORE_DOMAIN
            ? `https://${SHOPIFY_STORE_DOMAIN}/blogs/${params.blogHandle}/${article.handle}`
            : null,
        publishedAt: typeof article.published_at === "string" ? article.published_at : null,
      };
    }

    throw error;
  }
};
