"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebaseAdmin_1 = require("../config/firebaseAdmin");
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
const DEFAULT_COLLECTION_NAME = "product_categories";
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
function serializeValue(value) {
    if (value === null) {
        return null;
    }
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return {
            _type: "timestamp",
            seconds: value.seconds,
            nanoseconds: value.nanoseconds,
            iso: value.toDate().toISOString(),
        };
    }
    if (value instanceof firebase_admin_1.default.firestore.GeoPoint) {
        return {
            _type: "geopoint",
            latitude: value.latitude,
            longitude: value.longitude,
        };
    }
    if (value instanceof
        firebase_admin_1.default.firestore.DocumentReference) {
        return {
            _type: "documentReference",
            id: value.id,
            path: value.path,
        };
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return {
            _type: "bytes",
            base64: value.toString("base64"),
        };
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeValue(item));
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "object") {
        const serializedObject = {};
        for (const [key, nestedValue,] of Object.entries(value)) {
            serializedObject[key] =
                serializeValue(nestedValue);
        }
        return serializedObject;
    }
    if (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean") {
        return value;
    }
    return String(value);
}
function serializeDocumentData(data) {
    return serializeValue(data);
}
async function exportCollectionTree(collectionRef) {
    const snapshot = await collectionRef.get();
    const data = [];
    for (const doc of snapshot.docs) {
        const subcollections = await doc.ref.listCollections();
        const serializedDoc = {
            id: doc.id,
            ...serializeDocumentData(doc.data()),
        };
        if (subcollections.length > 0) {
            const nestedCollections = {};
            for (const subcollection of subcollections) {
                nestedCollections[subcollection.id] =
                    await exportCollectionTree(subcollection);
            }
            serializedDoc._subcollections =
                nestedCollections;
        }
        data.push(serializedDoc);
    }
    return data;
}
async function resolveCollectionsToExport() {
    if (shouldExportAllCollections) {
        const collections = await firebaseAdmin_1.firestore.listCollections();
        return collections.sort((left, right) => left.id.localeCompare(right.id));
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
            const data = await exportCollectionTree(collectionRef);
            const outputFile = path_1.default.join(OUTPUT_DIR, `${collectionRef.id}.json`);
            fs_1.default.writeFileSync(outputFile, JSON.stringify(data, null, 2), "utf-8");
            console.log(`Export completed: ${outputFile}`);
            console.log(`Top-level documents exported: ${data.length}`);
        }
        console.log("\nTip: pass one or more collection names, or use --all to export every root collection.");
    }
    catch (error) {
        console.error("Export failed:", error);
        process.exit(1);
    }
}
exportCollections();
