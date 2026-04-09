import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { firestore } from "../config/firebaseAdmin";

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

type JsonPrimitive =
    | string
    | number
    | boolean
    | null;

type JsonValue =
    | JsonPrimitive
    | JsonObject
    | JsonValue[];

type JsonObject = {
    [key: string]: JsonValue;
};

type ExportedDocument = JsonObject & {
    id: string;
    _subcollections?: Record<
        string,
        ExportedDocument[]
    >;
};

function parseCollectionNames(
    value?: string
): string[] {
    return (value ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
}

function isAllCollectionsToken(
    value: string
): boolean {
    return ALL_COLLECTIONS_TOKENS.has(
        value.toLowerCase()
    );
}

const cliCollectionNames = process.argv
    .slice(2)
    .map((name) => name.trim())
    .filter(Boolean);
const envCollectionNames = parseCollectionNames(
    process.env.FIRESTORE_COLLECTION
);
const shouldExportAllCollections =
    cliCollectionNames.some(
        isAllCollectionsToken
    ) ||
    envCollectionNames.some(
        isAllCollectionsToken
    );
const collectionNames = shouldExportAllCollections
    ? []
    : cliCollectionNames.length > 0
        ? cliCollectionNames
        : envCollectionNames.length > 0
            ? envCollectionNames
            : [DEFAULT_COLLECTION_NAME];
const collectionSource =
    cliCollectionNames.length > 0
        ? "CLI argument"
        : envCollectionNames.length > 0
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

function serializeValue(
    value: unknown
): JsonValue {
    if (value === null) {
        return null;
    }

    if (
        value instanceof admin.firestore.Timestamp
    ) {
        return {
            _type: "timestamp",
            seconds: value.seconds,
            nanoseconds: value.nanoseconds,
            iso: value.toDate().toISOString(),
        };
    }

    if (
        value instanceof admin.firestore.GeoPoint
    ) {
        return {
            _type: "geopoint",
            latitude: value.latitude,
            longitude: value.longitude,
        };
    }

    if (
        value instanceof
        admin.firestore.DocumentReference
    ) {
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
        return value.map((item) =>
            serializeValue(item)
        );
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (typeof value === "object") {
        const serializedObject: JsonObject = {};

        for (const [
            key,
            nestedValue,
        ] of Object.entries(
            value as Record<string, unknown>
        )) {
            serializedObject[key] =
                serializeValue(nestedValue);
        }

        return serializedObject;
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }

    return String(value);
}

function serializeDocumentData(
    data: FirebaseFirestore.DocumentData
): JsonObject {
    return serializeValue(data) as JsonObject;
}

async function exportCollectionTree(
    collectionRef: FirebaseFirestore.CollectionReference
): Promise<ExportedDocument[]> {
    const snapshot = await collectionRef.get();
    const data: ExportedDocument[] = [];

    for (const doc of snapshot.docs) {
        const subcollections =
            await doc.ref.listCollections();
        const serializedDoc: ExportedDocument =
        {
            id: doc.id,
            ...serializeDocumentData(
                doc.data()
            ),
        };

        if (subcollections.length > 0) {
            const nestedCollections: Record<
                string,
                ExportedDocument[]
            > = {};

            for (const subcollection of subcollections) {
                nestedCollections[
                    subcollection.id
                ] =
                    await exportCollectionTree(
                        subcollection
                    );
            }

            serializedDoc._subcollections =
                nestedCollections;
        }

        data.push(serializedDoc);
    }

    return data;
}

async function resolveCollectionsToExport(): Promise<
    FirebaseFirestore.CollectionReference[]
> {
    if (shouldExportAllCollections) {
        const collections =
            await firestore.listCollections();

        return collections.sort((left, right) =>
            left.id.localeCompare(right.id)
        );
    }

    return collectionNames.map((name) =>
        firestore.collection(name)
    );
}

async function exportCollections() {
    try {
        console.log(
            shouldExportAllCollections
                ? "Exporting all root collections with nested subcollections"
                : `Exporting collections: ${collectionNames.join(
                    ", "
                )}`
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

        const collections =
            await resolveCollectionsToExport();

        for (const collectionRef of collections) {
            console.log(
                `\nProcessing collection: ${collectionRef.id}`
            );

            const data =
                await exportCollectionTree(
                    collectionRef
                );
            const outputFile = path.join(
                OUTPUT_DIR,
                `${collectionRef.id}.json`
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
                `Top-level documents exported: ${data.length}`
            );
        }

        console.log(
            "\nTip: pass one or more collection names, or use --all to export every root collection."
        );
    } catch (error) {
        console.error(
            "Export failed:",
            error
        );
        process.exit(1);
    }
}

exportCollections();
