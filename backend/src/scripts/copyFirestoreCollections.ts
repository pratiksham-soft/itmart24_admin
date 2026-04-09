import admin from "firebase-admin";
import fs from "fs";
import path from "path";

type ServiceAccountJson = admin.ServiceAccount & {
  project_id?: string;
};

type AppConfig = {
  appName: string;
  projectId: string;
  credentialsPath: string;
};

type CopyStats = {
  documentsCopied: number;
  subcollectionsVisited: number;
};

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_COLLECTIONS = [
  "subscription_plans",
  "product_categories",
];

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(BACKEND_ROOT, filePath);
}

function loadServiceAccount(filePath: string): ServiceAccountJson {
  const resolvedPath = resolvePath(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account file not found: ${resolvedPath}`);
  }

  return JSON.parse(
    fs.readFileSync(resolvedPath, "utf8")
  ) as ServiceAccountJson;
}

function createApp(config: AppConfig) {
  const serviceAccount = loadServiceAccount(config.credentialsPath);

  if (
    serviceAccount.project_id &&
    serviceAccount.project_id !== config.projectId
  ) {
    throw new Error(
      `${config.appName} project mismatch: expected ${config.projectId}, got ${serviceAccount.project_id}`
    );
  }

  return admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      projectId: config.projectId,
    },
    config.appName
  );
}

async function copyCollectionRecursive(
  sourceCollection: FirebaseFirestore.CollectionReference,
  targetCollection: FirebaseFirestore.CollectionReference
): Promise<CopyStats> {
  const snapshot = await sourceCollection.get();
  let documentsCopied = 0;
  let subcollectionsVisited = 0;

  for (const sourceDoc of snapshot.docs) {
    const targetDoc = targetCollection.doc(sourceDoc.id);
    await targetDoc.set(sourceDoc.data());
    documentsCopied += 1;

    const subcollections = await sourceDoc.ref.listCollections();

    for (const subcollection of subcollections) {
      subcollectionsVisited += 1;
      const nestedStats = await copyCollectionRecursive(
        subcollection,
        targetDoc.collection(subcollection.id)
      );
      documentsCopied += nestedStats.documentsCopied;
      subcollectionsVisited += nestedStats.subcollectionsVisited;
    }
  }

  return {
    documentsCopied,
    subcollectionsVisited,
  };
}

async function copyProductCategoriesCollection(
  sourceDb: FirebaseFirestore.Firestore,
  targetDb: FirebaseFirestore.Firestore
): Promise<CopyStats> {
  const writer = targetDb.bulkWriter();
  const mainsSnapshot = await sourceDb
    .collection("product_categories")
    .get();

  let documentsCopied = 0;
  let subcollectionsVisited = 0;

  for (const mainDoc of mainsSnapshot.docs) {
    const targetMainRef = targetDb
      .collection("product_categories")
      .doc(mainDoc.id);
    writer.set(targetMainRef, mainDoc.data());
    documentsCopied += 1;
    subcollectionsVisited += 1;

    const subcategoriesSnapshot = await mainDoc.ref
      .collection("subcategories")
      .get();

    for (const subDoc of subcategoriesSnapshot.docs) {
      const targetSubRef = targetMainRef
        .collection("subcategories")
        .doc(subDoc.id);
      writer.set(targetSubRef, subDoc.data());
      documentsCopied += 1;
      subcollectionsVisited += 1;

      const subsubcategoriesSnapshot = await subDoc.ref
        .collection("subsubcategories")
        .get();

      for (const subSubDoc of subsubcategoriesSnapshot.docs) {
        writer.set(
          targetSubRef
            .collection("subsubcategories")
            .doc(subSubDoc.id),
          subSubDoc.data()
        );
        documentsCopied += 1;
      }
    }
  }

  await writer.close();

  return {
    documentsCopied,
    subcollectionsVisited,
  };
}

async function main() {
  const sourceConfig: AppConfig = {
    appName: "source-production",
    projectId: requireEnv(
      "SOURCE_FIREBASE_PROJECT_ID",
      "vendor-portal-91ecc"
    ),
    credentialsPath: requireEnv(
      "SOURCE_GOOGLE_APPLICATION_CREDENTIALS",
      "./firebase-service-account.json"
    ),
  };

  const targetConfig: AppConfig = {
    appName: "target-staging",
    projectId: requireEnv(
      "TARGET_FIREBASE_PROJECT_ID",
      "dev-vendor-portal-11c9d"
    ),
    credentialsPath: requireEnv(
      "TARGET_GOOGLE_APPLICATION_CREDENTIALS",
      "./firebase-service-account.staging.json"
    ),
  };

  const collections = process.argv.slice(2).filter(Boolean);
  const collectionsToCopy =
    collections.length > 0 ? collections : DEFAULT_COLLECTIONS;

  console.log("Source project:", sourceConfig.projectId);
  console.log("Target project:", targetConfig.projectId);
  console.log("Collections:", collectionsToCopy.join(", "));
  console.log(
    "Mode: upsert by document ID, no deletes in target project"
  );

  const sourceApp = createApp(sourceConfig);
  const targetApp = createApp(targetConfig);

  const sourceDb = sourceApp.firestore();
  const targetDb = targetApp.firestore();

  for (const collectionName of collectionsToCopy) {
    console.log(`\nCopying collection: ${collectionName}`);
    const stats =
      collectionName === "product_categories"
        ? await copyProductCategoriesCollection(sourceDb, targetDb)
        : await copyCollectionRecursive(
            sourceDb.collection(collectionName),
            targetDb.collection(collectionName)
          );
    console.log(
      `Finished ${collectionName}: ${stats.documentsCopied} documents copied, ${stats.subcollectionsVisited} subcollections traversed`
    );
  }

  console.log("\nCopy completed successfully.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Copy failed:", error);
    process.exit(1);
  });
