"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichProductsWithVendors = void 0;
const firebase_1 = require("../config/firebase");
const enrichProductsWithVendors = async (products) => {
    if (!products.length)
        return [];
    // Collect unique vendorIds
    const vendorIds = Array.from(new Set(products
        .flatMap((product) => [product.vendorId, product.ownership?.claimedByVendorId])
        .filter(Boolean)));
    // Fetch vendor profiles
    const vendorSnapshots = await Promise.all(vendorIds.map((id) => firebase_1.firestore.collection("vendor_profile").doc(id).get()));
    // Build vendor lookup map
    const vendorMap = {};
    vendorSnapshots.forEach((snap) => {
        if (snap.exists) {
            vendorMap[snap.id] = snap.data();
        }
    });
    // Enrich products
    return products.map((product) => {
        const vendorProfile = vendorMap[product.vendorId] ?? null;
        const claimedByVendorProfile = vendorMap[product.ownership?.claimedByVendorId] ?? null;
        const resolvedVendorName = vendorProfile?.businessName ??
            vendorProfile?.business_name ??
            vendorProfile?.vendorName ??
            "—";
        const resolvedClaimedByVendorName = claimedByVendorProfile?.businessName ??
            claimedByVendorProfile?.business_name ??
            claimedByVendorProfile?.vendorName ??
            null;
        const resolvedBasic = {
            productName: product.vendor?.basic?.productName ??
                product.shopify?.product?.title ??
                "Unnamed Product",
            category: product.vendor?.basic?.category ??
                product.shopify?.product?.category ??
                "—",
            description: product.vendor?.basic?.description ??
                product.shopify?.product?.descriptionHtml ??
                "",
        };
        const resolvedPricing = {
            selectedPlan: product.vendor?.pricing?.selectedPlan ??
                product.shopify?.shopifyData?.metafields?.plan ??
                "default",
            price: Number(product.vendor?.pricing?.price ??
                product.shopify?.shopifyData?.variants?.[0]?.price ??
                0),
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
exports.enrichProductsWithVendors = enrichProductsWithVendors;
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
