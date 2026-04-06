import { firestore } from "../config/firebase";
import admin from "firebase-admin";
import { shopifyRest } from "./shopifyHttp";

const PRODUCTS_LIMIT = 50;

type ImportShopifyProductsProgress = {
  totalProducts: number;
  processedProducts: number;
  imported: number;
  skipped: number;
  message: string;
};

type ImportShopifyProductsOptions = {
  onProgress?: (
    progress: ImportShopifyProductsProgress
  ) => void | Promise<void>;
};

const notifyProgress = async (
  onProgress:
    | ImportShopifyProductsOptions["onProgress"]
    | undefined,
  progress: ImportShopifyProductsProgress
) => {
  if (onProgress) {
    await onProgress(progress);
  }
};

export async function importShopifyProductsToFirestore(
  options: ImportShopifyProductsOptions = {}
) {
  let pageInfo: string | null = null;
  let imported = 0;
  let skipped = 0;
  let processedProducts = 0;
  let totalProducts = 0;

  try {
    const countResponse = await shopifyRest.get(
      "/products/count.json"
    );
    totalProducts =
      typeof countResponse.data?.count === "number"
        ? countResponse.data.count
        : 0;
  } catch (countError) {
    console.warn(
      "Unable to fetch Shopify products count before sync:",
      countError
    );
  }

  await notifyProgress(options.onProgress, {
    totalProducts,
    processedProducts,
    imported,
    skipped,
    message:
      totalProducts > 0
        ? `Preparing to sync ${totalProducts} Shopify products...`
        : "Preparing Shopify products sync...",
  });

    // Fetch all existing Firestore product IDs once
  const existingProductIdsSnapshot =
    await firestore.collection("products").select().get();

  const existingProductIds = new Set<string>(
    existingProductIdsSnapshot.docs.map(
      (doc) => doc.id
    )
  );

  do {
    const params: any = {
            limit: PRODUCTS_LIMIT,
            };

            if (pageInfo) {
            params.page_info = pageInfo;
            }

            const response: {
            data: { products: any[] };
            headers: { link?: string };
            } = await shopifyRest.get("/products.json", {
            params,
            });

    const products = response.data.products || [];

    console.log(
      "Shopify products fetched:",
      products.length
    );

    for (const product of products) {
      
      const shopifyProductId = product.id;
      const docId = String(shopifyProductId);

      const productRef = firestore
        .collection("products")
        .doc(docId);

            // DUPLICATE CHECK (in-memory, ultra-fast)
            if (existingProductIds.has(docId)) {
              skipped++;
              processedProducts++;
              await notifyProgress(options.onProgress, {
                totalProducts,
                processedProducts,
                imported,
                skipped,
                message: `Processed ${processedProducts} of ${
                  totalProducts || processedProducts
                } Shopify products...`,
              });
              continue;
            }

      // Extract metafields (namespace = custom)
      const metafieldsRes = await shopifyRest.get(
        `/products/${shopifyProductId}/metafields.json`
      );

      const metafields = (metafieldsRes.data.metafields || [])
        .filter((m: any) => m.namespace === "custom")
        .reduce((acc: any, mf: any) => {
          acc[mf.key] =
            mf.type?.startsWith("list.")
              ? JSON.parse(mf.value)
              : mf.type === "boolean"
              ? mf.value === "true"
              : mf.value;
          return acc;
        }, {});

      // Firestore unified document
      await productRef.set({
      
      vendorId: metafields.vendor_id
        ? String(metafields.vendor_id)
        : "unknown",

      ownership: {
        claimed: false,
        claimedByVendorId: null,
        claimedAt: null,
      },

      lifecycleStatus: "active",

      // ALL EXISTING SHOPIFY DATA MOVED HERE (AS-IS)
      shopify: {
        shopifyStatus: product.status,

        product: {
          title: product.title,
          handle: product.handle,
          descriptionHtml: product.body_html,
          category: product.product_type,
          productType: product.product_type,
          vendor: product.vendor,
          tags: product.tags
            ? product.tags.split(",").map((t: string) => t.trim())
            : [],
          published: product.published_at != null,
        },

        shopifyData: {
          seo: {
            title: product.metafields_global_title_tag || "",
            description:
              product.metafields_global_description_tag || "",
          },
          variants: product.variants.map((v: any) => ({
            id: v.id,
            price: v.price,
          })),
          metafields,
        },

        identifiers: {
          productId: product.id,
          graphqlId: product.admin_graphql_api_id,
          handle: product.handle,
          shopifyProductURL: product.handle
            ? `https://www.itmart24.com/products/${product.handle}`
            : null,
        },

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },

      // 🔹 EMPTY VENDOR CONTAINER (FOR NOW)
      vendor: {},

      createdAt:
        admin.firestore.FieldValue.serverTimestamp(),
    });

      imported++;
      processedProducts++;
      existingProductIds.add(docId);

      await notifyProgress(options.onProgress, {
        totalProducts,
        processedProducts,
        imported,
        skipped,
        message: `Processed ${processedProducts} of ${
          totalProducts || processedProducts
        } Shopify products...`,
      });
    }

    // Pagination handling
    const linkHeader: string | undefined = response.headers.link;
    const nextLink: string | undefined =
            linkHeader
                ?.split(",")
                .find((l: string) =>
                l.includes('rel="next"')
                );

    pageInfo = nextLink
      ? new URL(nextLink.match(/<([^>]+)>/)![1]).searchParams.get(
          "page_info"
        )
      : null;
  } while (pageInfo);

  return {
    imported,
    skipped,
    processedProducts,
    totalProducts,
  };
}
