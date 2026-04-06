"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const firebaseAdmin_1 = require("../config/firebaseAdmin");
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
const collectionName = cliCollectionName ||
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
const BACKEND_ROOT = path_1.default.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path_1.default.join(BACKEND_ROOT, "exports");
async function exportCollection() {
    try {
        console.log(`Exporting collection: ${collectionName}`);
        console.log(`Collection source: ${collectionSource}`);
        console.log(`Script location: ${__filename}`);
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Export directory: ${OUTPUT_DIR}`);
        if (!fs_1.default.existsSync(OUTPUT_DIR)) {
            fs_1.default.mkdirSync(OUTPUT_DIR, {
                recursive: true,
            });
        }
        const snapshot = await firebaseAdmin_1.firestore
            .collection(collectionName)
            .get();
        const data = [];
        snapshot.forEach((doc) => {
            data.push({
                id: doc.id,
                ...doc.data(),
            });
        });
        const outputFile = path_1.default.join(OUTPUT_DIR, `${collectionName}.json`);
        fs_1.default.writeFileSync(outputFile, JSON.stringify(data, null, 2), "utf-8");
        console.log(`Export completed: ${outputFile}`);
        console.log(`Documents exported: ${data.length}`);
        console.log("Tip: pass a collection name, for example: npx ts-node src/scripts/exportFirestoreToJson.ts products");
    }
    catch (error) {
        console.error("Export failed:", error);
        process.exit(1);
    }
}
exportCollection();
