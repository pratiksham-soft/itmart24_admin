import fs from "fs";
import path from "path";
import { firestore } from "../config/firebaseAdmin";

/**
 * Script to run
 * npx ts-node src/scripts/exportFirestoreToJson.ts
 * npx ts-node src/scripts/exportFirestoreToJson.ts products
 * FIRESTORE_COLLECTION=products npx ts-node src/scripts/exportFirestoreToJson.ts
 */

/**
 * Default Firestore collection name.
 * Override with a CLI argument or FIRESTORE_COLLECTION env variable.
 */
const DEFAULT_COLLECTION_NAME = "vendor_profile";
const cliCollectionName = process.argv[2]?.trim();
const envCollectionName = process.env.FIRESTORE_COLLECTION?.trim();
const collectionName =
    cliCollectionName ||
    envCollectionName ||
    DEFAULT_COLLECTION_NAME;
const collectionSource = cliCollectionName
    ? "CLI argument"
    : envCollectionName
        ? "FIRESTORE_COLLECTION env"
        : "default in script";

/**
 * Save inside backend/exports no matter where the command is run from.
 */
const BACKEND_ROOT = path.resolve(
    __dirname,
    "..",
    ".."
);
const OUTPUT_DIR = path.join(
    BACKEND_ROOT,
    "exports"
);

async function exportCollection() {
    try {
        console.log(
            `Exporting collection: ${collectionName}`
        );
        console.log(
            `Collection source: ${collectionSource}`
        );
        console.log(
            `Script location: ${__filename}`
        );
        console.log(
            `Current working directory: ${process.cwd()}`
        );
        console.log(
            `Export directory: ${OUTPUT_DIR}`
        );

        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, {
                recursive: true,
            });
        }

        const snapshot = await firestore
            .collection(collectionName)
            .get();

        const data: any[] = [];

        snapshot.forEach((doc) => {
            data.push({
                id: doc.id,
                ...doc.data(),
            });
        });

        const outputFile = path.join(
            OUTPUT_DIR,
            `${collectionName}.json`
        );

        fs.writeFileSync(
            outputFile,
            JSON.stringify(data, null, 2),
            "utf-8"
        );

        console.log(
            `Export completed: ${outputFile}`
        );
        console.log(
            `Documents exported: ${data.length}`
        );
        console.log(
            "Tip: pass a collection name, for example: npx ts-node src/scripts/exportFirestoreToJson.ts products"
        );
    } catch (error) {
        console.error(
            "Export failed:",
            error
        );
        process.exit(1);
    }
}

exportCollection();
