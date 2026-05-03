import { firestore } from "../config/firebase";

const VENDOR_PROFILE_COLLECTION = "vendor_profile";
const VENDOR_BATCH_SIZE = 250;
const vendorProfileCache = new Map<string, any>();

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const loadVendorProfiles = async (vendorIds: string[]) => {
  const uncachedVendorIds = vendorIds.filter(
    (vendorId) => !vendorProfileCache.has(vendorId)
  );

  for (const vendorIdChunk of chunk(uncachedVendorIds, VENDOR_BATCH_SIZE)) {
    const refs = vendorIdChunk.map((vendorId) =>
      firestore.collection(VENDOR_PROFILE_COLLECTION).doc(vendorId)
    );
    const snapshots = await firestore.getAll(...refs);

    snapshots.forEach((snapshot) => {
      vendorProfileCache.set(snapshot.id, snapshot.exists ? snapshot.data() : null);
    });
  }
};

export const enrichProductsWithVendors = async (products: any[]) => {
  if (!products.length) return [];

  // Collect unique vendorIds
  const vendorIds = Array.from(
    new Set(
      products
        .flatMap((product) => [product.vendorId, product.ownership?.claimedByVendorId])
        .filter(Boolean)
    )
  );

  await loadVendorProfiles(vendorIds);

  // Build vendor lookup map
  const vendorMap: Record<string, any> = {};
  vendorIds.forEach((vendorId) => {
    vendorMap[vendorId] = vendorProfileCache.get(vendorId) ?? null;
  });

  // Enrich products
  return products.map((product) => {
    const vendorProfile = vendorMap[product.vendorId] ?? null;
    const claimedByVendorProfile = vendorMap[product.ownership?.claimedByVendorId] ?? null;

    const resolvedVendorName =
      vendorProfile?.businessName ??
      vendorProfile?.business_name ??
      vendorProfile?.vendorName ??
      "—";

    const resolvedClaimedByVendorName =
      claimedByVendorProfile?.businessName ??
      claimedByVendorProfile?.business_name ??
      claimedByVendorProfile?.vendorName ??
      null;

    const resolvedBasic = {
      productName:
        product.vendor?.basic?.productName ??
        product.shopify?.product?.title ??
        "Unnamed Product",

      category:
        product.vendor?.basic?.category ??
        product.shopify?.product?.category ??
        "—",

      description:
        product.vendor?.basic?.description ??
        product.shopify?.product?.descriptionHtml ??
        "",
    };

    const resolvedPricing = {
      selectedPlan:
        product.vendor?.pricing?.selectedPlan ??
        product.shopify?.shopifyData?.metafields?.plan ??
        "default",

      price: Number(
        product.vendor?.pricing?.price ??
          product.shopify?.shopifyData?.variants?.[0]?.price ??
          0
      ),
    };

    return {
      ...product,

      // 🔑 normalized vendor object (centralized)
      vendorResolved: {
        vendorId: product.vendorId,
        businessName: resolvedVendorName,
        claimedByBusinessName: resolvedClaimedByVendorName,
        basic: resolvedBasic,
        pricing: resolvedPricing,
      },
      claimedByBusinessName: resolvedClaimedByVendorName,
    };
  });
};






// import { firestore } from "../config/firebase";

// type FirestoreProductData = {
//   vendorId: string;
//   [key: string]: any;
// };

// type FirestoreProduct = FirestoreProductData & {
//   id: string;
// };

// const vendorCache = new Map<string, string>();

// export async function enrichProductsWithVendors(
//   products: FirestoreProduct[]
// ): Promise<(FirestoreProduct & { businessName: string })[]> {
//   // 1. Collect unique vendorIds
//   const vendorIds = Array.from(
//     new Set(products.map((p) => p.vendorId).filter(Boolean))
//   );

//   // 2. Fetch vendor profiles
//   const vendorSnapshots = await Promise.all(
//   vendorIds.map(async (vendorId) => {
//     // 1. Check cache first
//     if (vendorCache.has(vendorId)) {
//       return {
//         vendorId,
//         businessName: vendorCache.get(vendorId)!,
//       };
//     }

//     // 2. Fetch from Firestore
//     const snap = await firestore
//       .collection("vendor_profile")
//       .doc(vendorId)
//       .get();

//     const businessName = snap.exists
//       ? snap.data()?.businessName || "Unknown Vendor"
//       : "Unknown Vendor";

//     // 3. Store in cache
//     vendorCache.set(vendorId, businessName);

//     return {
//       vendorId,
//       businessName,
//     };
//   })
// );

//   // 3. Create lookup map
//   const vendorMap: Record<string, string> = {};
//   vendorSnapshots.forEach((v) => {
//     vendorMap[v.vendorId] = v.businessName;
//   });

//   // 4. Attach businessName to products
//   return products.map((p) => ({
//     ...p,
//     businessName: vendorMap[p.vendorId] || "Unknown Vendor",
//   }));
// }
