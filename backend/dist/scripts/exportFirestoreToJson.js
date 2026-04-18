"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const firebaseAdmin_1 = require("../config/firebaseAdmin");
const firestoreExport_service_1 = require("../services/firestoreExport.service");
/**
 * Example usage: Script to run
 * npx ts-node src/scripts/exportFirestoreToJson.ts
 * npx ts-node src/scripts/exportFirestoreToJson.ts product_categories
 * npx ts-node src/scripts/exportFirestoreToJson.ts product_categories subscription_plans
 * npx ts-node src/scripts/exportFirestoreToJson.ts --all

 */
/**
 * Default Firestore collection name.
 * Override with a CLI argument or FIRESTORE_COLLECTION env variable.
 */
const DEFAULT_COLLECTION_NAME = "ai_insight_snapshots";
const ALL_COLLECTIONS_TOKENS = new Set([
    "all",
    "--all",
    "*",
]);
function parseCollectionNames(value) {
    return (value ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
}
function isAllCollectionsToken(value) {
    return ALL_COLLECTIONS_TOKENS.has(value.toLowerCase());
}
const cliCollectionNames = process.argv
    .slice(2)
    .map((name) => name.trim())
    .filter(Boolean);
const envCollectionNames = parseCollectionNames(process.env.FIRESTORE_COLLECTION);
const shouldExportAllCollections = cliCollectionNames.some(isAllCollectionsToken) ||
    envCollectionNames.some(isAllCollectionsToken);
const collectionNames = shouldExportAllCollections
    ? []
    : cliCollectionNames.length > 0
        ? cliCollectionNames
        : envCollectionNames.length > 0
            ? envCollectionNames
            : [DEFAULT_COLLECTION_NAME];
const collectionSource = cliCollectionNames.length > 0
    ? "CLI argument"
    : envCollectionNames.length > 0
        ? "FIRESTORE_COLLECTION env"
        : "default in script";
/**
 * Save inside backend/exports no matter where the command is run from.
 */
const BACKEND_ROOT = path_1.default.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path_1.default.join(BACKEND_ROOT, "exports");
async function resolveCollectionsToExport() {
    if (shouldExportAllCollections) {
        const collectionNames = await (0, firestoreExport_service_1.listFirestoreRootCollections)();
        return collectionNames.map((name) => firebaseAdmin_1.firestore.collection(name));
    }
    return collectionNames.map((name) => firebaseAdmin_1.firestore.collection(name));
}
async function exportCollections() {
    try {
        console.log(shouldExportAllCollections
            ? "Exporting all root collections with nested subcollections"
            : `Exporting collections: ${collectionNames.join(", ")}`);
        console.log(`Collection source: ${collectionSource}`);
        console.log(`Script location: ${__filename}`);
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`Export directory: ${OUTPUT_DIR}`);
        if (!fs_1.default.existsSync(OUTPUT_DIR)) {
            fs_1.default.mkdirSync(OUTPUT_DIR, {
                recursive: true,
            });
        }
        const collections = await resolveCollectionsToExport();
        for (const collectionRef of collections) {
            console.log(`\nProcessing collection: ${collectionRef.id}`);
            const { documents, } = await (0, firestoreExport_service_1.exportCollectionTree)(collectionRef);
            const outputFile = path_1.default.join(OUTPUT_DIR, `${collectionRef.id}.json`);
            fs_1.default.writeFileSync(outputFile, JSON.stringify(documents, null, 2), "utf-8");
            console.log(`Export completed: ${outputFile}`);
            console.log(`Top-level documents exported: ${documents.length}`);
        }
        console.log("\nTip: pass one or more collection names, or use --all to export every root collection.");
    }
    catch (error) {
        console.error("Export failed:", error);
        process.exit(1);
    }
}
exportCollections();
