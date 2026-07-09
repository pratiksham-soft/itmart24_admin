import "../config/env";
import { firestore } from "../config/firebaseAdmin";
import { DIGITAL_SERVICES_CATEGORY } from "./lib/digitalServicesCatalog";

type CounterState = {
  created: number;
  updated: number;
  skipped: number;
  duplicateWarnings: number;
};

const counters: CounterState = {
  created: 0,
  updated: 0,
  skipped: 0,
  duplicateWarnings: 0,
};

const timestampNow = () => new Date();

const shallowEqual = (
  current: Record<string, unknown>,
  next: Record<string, unknown>
) =>
  Object.entries(next).every(([key, value]) => {
    const currentValue = current[key];
    return currentValue === value;
  });

const resolveSingleDocBySlug = async (
  collectionRef: FirebaseFirestore.CollectionReference,
  slug: string,
  label: string
) => {
  const snapshot = await collectionRef.where("slug", "==", slug).get();

  if (snapshot.docs.length > 1) {
    counters.duplicateWarnings += 1;
    console.warn(
      `Duplicate slug warning for ${label}: "${slug}" matched ${snapshot.docs.length} documents. Reusing the first document.`
    );
  }

  return snapshot.docs[0] ?? null;
};

const upsertCategoryDoc = async ({
  collectionRef,
  docId,
  slug,
  name,
  order,
  label,
}: {
  collectionRef: FirebaseFirestore.CollectionReference;
  docId: string;
  slug: string;
  name: string;
  order: number;
  label: string;
}) => {
  const existingBySlug = await resolveSingleDocBySlug(collectionRef, slug, label);
  const existingByDocId = await collectionRef.doc(docId).get();
  const existingDoc =
    existingBySlug ?? (existingByDocId.exists ? existingByDocId : null);

  const targetRef = existingDoc?.ref ?? collectionRef.doc(docId);
  const targetSnapshot = existingDoc ?? existingByDocId;
  const existingData = targetSnapshot.exists ? targetSnapshot.data() ?? {} : {};
  const basePayload = {
    name,
    slug,
    isActive: true,
    isDeleted: false,
    order,
  };

  if (!targetSnapshot.exists) {
    await targetRef.set({
      ...basePayload,
      createdAt: timestampNow(),
      updatedAt: timestampNow(),
    });
    counters.created += 1;
    console.log(`Created ${label}: ${name}`);
    return targetRef;
  }

  if (shallowEqual(existingData, basePayload)) {
    counters.skipped += 1;
    console.log(`Skipped ${label}: ${name}`);
    return targetRef;
  }

  await targetRef.set(
    {
      ...basePayload,
      updatedAt: timestampNow(),
      createdAt: existingData.createdAt ?? timestampNow(),
    },
    { merge: true }
  );
  counters.updated += 1;
  console.log(`Updated ${label}: ${name}`);
  return targetRef;
};

async function main() {
  const mainRef = await upsertCategoryDoc({
    collectionRef: firestore.collection("product_categories"),
    docId: DIGITAL_SERVICES_CATEGORY.slug,
    slug: DIGITAL_SERVICES_CATEGORY.slug,
    name: DIGITAL_SERVICES_CATEGORY.name,
    order: 9999,
    label: "main category",
  });

  for (const [subIndex, subcategory] of DIGITAL_SERVICES_CATEGORY.subcategories.entries()) {
    const subcategoryRef = await upsertCategoryDoc({
      collectionRef: mainRef.collection("subcategories"),
      docId: subcategory.slug,
      slug: subcategory.slug,
      name: subcategory.name,
      order: (subIndex + 1) * 100,
      label: "subcategory",
    });

    for (const [finalIndex, finalCategory] of subcategory.finalCategories.entries()) {
      await upsertCategoryDoc({
        collectionRef: subcategoryRef.collection("subsubcategories"),
        docId: finalCategory.slug,
        slug: finalCategory.slug,
        name: finalCategory.name,
        order: (subIndex + 1) * 100 + finalIndex + 1,
        label: "final category",
      });
    }
  }

  console.log("");
  console.log(`Created count: ${counters.created}`);
  console.log(`Updated count: ${counters.updated}`);
  console.log(`Skipped count: ${counters.skipped}`);
  console.log(`Duplicate handle warnings: ${counters.duplicateWarnings}`);
}

main().catch((error) => {
  console.error("Failed to upsert Digital Services Firestore categories:", error);
  process.exitCode = 1;
});
