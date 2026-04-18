"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFirestoreRootCollections = listFirestoreRootCollections;
exports.exportCollectionTree = exportCollectionTree;
exports.buildFirestoreExport = buildFirestoreExport;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebaseAdmin_1 = require("../config/firebaseAdmin");
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function isPlainObject(value) {
    return (Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value));
}
function parseDateBoundary(value, boundary) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }
    const candidate = DATE_ONLY_PATTERN.test(trimmed)
        ? new Date(`${trimmed}T${boundary === "start"
            ? "00:00:00.000"
            : "23:59:59.999"}Z`)
        : new Date(trimmed);
    if (Number.isNaN(candidate.getTime())) {
        throw new Error(`Invalid ${boundary === "start"
            ? "fromDate"
            : "toDate"} value`);
    }
    return candidate;
}
function resolveDateRange(input = {}) {
    const fromDateInput = input.fromDate?.trim() || null;
    const toDateInput = input.toDate?.trim() || null;
    const fromDate = parseDateBoundary(fromDateInput, "start");
    const toDate = parseDateBoundary(toDateInput, "end");
    if (fromDate &&
        toDate &&
        fromDate.getTime() > toDate.getTime()) {
        throw new Error("From Date cannot be later than To Date");
    }
    return {
        fromDate,
        toDate,
        fromDateInput,
        toDateInput,
    };
}
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
        return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
            accumulator[key] =
                serializeValue(nestedValue);
            return accumulator;
        }, {});
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
function collectDateCandidates(value, path = []) {
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return [value.toDate()];
    }
    if (value instanceof Date) {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectDateCandidates(item, path));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, nestedValue]) => collectDateCandidates(nestedValue, [
            ...path,
            key,
        ]));
    }
    const currentKey = path[path.length - 1] ?? "";
    const looksLikeDateField = /(date|at)$/i.test(currentKey);
    if (looksLikeDateField &&
        (typeof value === "string" ||
            typeof value === "number")) {
        const candidate = new Date(value);
        if (!Number.isNaN(candidate.getTime())) {
            return [candidate];
        }
    }
    return [];
}
function matchesDateRange(data, dateRange) {
    if (!dateRange.fromDate &&
        !dateRange.toDate) {
        return true;
    }
    const candidates = collectDateCandidates(data);
    if (candidates.length === 0) {
        return false;
    }
    return candidates.some((candidate) => {
        if (dateRange.fromDate &&
            candidate.getTime() <
                dateRange.fromDate.getTime()) {
            return false;
        }
        if (dateRange.toDate &&
            candidate.getTime() >
                dateRange.toDate.getTime()) {
            return false;
        }
        return true;
    });
}
function getExportValueType(value) {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "array";
    }
    if (isPlainObject(value) &&
        typeof value._type === "string") {
        return value._type;
    }
    if (typeof value === "object") {
        return "object";
    }
    return typeof value;
}
function collectValueMetadata(value, path, fieldPaths, schemaMap) {
    fieldPaths.add(path);
    const currentTypes = schemaMap.get(path) ?? new Set();
    currentTypes.add(getExportValueType(value));
    schemaMap.set(path, currentTypes);
    if (Array.isArray(value)) {
        value.forEach((item) => collectValueMetadata(item, `${path}[]`, fieldPaths, schemaMap));
        return;
    }
    if (isPlainObject(value) &&
        typeof value._type === "string") {
        return;
    }
    if (isPlainObject(value)) {
        Object.entries(value).forEach(([key, nestedValue]) => {
            collectValueMetadata(nestedValue, `${path}.${key}`, fieldPaths, schemaMap);
        });
    }
}
function collectDocumentMetadata(document, fieldPaths, schemaMap, subcollectionCounts, subcollectionPrefix = "") {
    Object.entries(document).forEach(([key, value]) => {
        if (key === "id" ||
            key === "_subcollections") {
            return;
        }
        collectValueMetadata(value, key, fieldPaths, schemaMap);
    });
    Object.entries(document._subcollections ?? {}).forEach(([subcollectionName, documents]) => {
        const path = subcollectionPrefix
            ? `${subcollectionPrefix}/${subcollectionName}`
            : subcollectionName;
        subcollectionCounts.set(path, (subcollectionCounts.get(path) ?? 0) +
            documents.length);
        documents.forEach((nestedDocument) => collectDocumentMetadata(nestedDocument, fieldPaths, schemaMap, subcollectionCounts, path));
    });
}
function buildCollectionMetadata(collectionName, documents, scannedDocuments, sections) {
    const fieldPaths = new Set();
    const schemaMap = new Map();
    const subcollectionCounts = new Map();
    documents.forEach((document) => collectDocumentMetadata(document, fieldPaths, schemaMap, subcollectionCounts));
    const result = {
        collection: collectionName,
        scannedDocuments,
        exportedDocuments: documents.length,
    };
    if (sections.schema) {
        result.schema = Array.from(schemaMap.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .reduce((accumulator, [path, valueTypes]) => {
            accumulator[path] = Array.from(valueTypes).sort((left, right) => left.localeCompare(right));
            return accumulator;
        }, {});
    }
    if (sections.structure) {
        result.structure = {
            documentCount: documents.length,
            subcollections: Array.from(subcollectionCounts.entries())
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([path, documentCount]) => ({
                path,
                documentCount,
            })),
        };
    }
    if (sections.dataFields) {
        result.dataFields = Array.from(fieldPaths).sort((left, right) => left.localeCompare(right));
    }
    if (sections.values) {
        result.values = documents;
    }
    if (sections.topDocuments) {
        result.top10Documents =
            documents.slice(0, 10);
    }
    return result;
}
async function listFirestoreRootCollections() {
    const collections = await firebaseAdmin_1.firestore.listCollections();
    return collections
        .map((collection) => collection.id)
        .sort((left, right) => left.localeCompare(right));
}
async function exportCollectionTree(collectionRef, input = {}) {
    const dateRange = resolveDateRange(input);
    const snapshot = await collectionRef.get();
    const documents = [];
    for (const doc of [...snapshot.docs].sort((left, right) => left.id.localeCompare(right.id))) {
        const rawData = doc.data();
        if (!matchesDateRange(rawData, dateRange)) {
            continue;
        }
        const subcollections = (await doc.ref.listCollections()).sort((left, right) => left.id.localeCompare(right.id));
        const serializedDoc = {
            id: doc.id,
            ...serializeDocumentData(rawData),
        };
        if (subcollections.length > 0) {
            const nestedCollections = {};
            for (const subcollection of subcollections) {
                const nestedExport = await exportCollectionTree(subcollection, input);
                if (nestedExport.documents.length > 0) {
                    nestedCollections[subcollection.id] = nestedExport.documents;
                }
            }
            if (Object.keys(nestedCollections).length >
                0) {
                serializedDoc._subcollections =
                    nestedCollections;
            }
        }
        documents.push(serializedDoc);
    }
    return {
        documents,
        scannedDocuments: snapshot.size,
    };
}
async function buildFirestoreExport(collections, sections, dateRangeInput = {}) {
    const normalizedCollections = Array.from(new Set(collections
        .map((collection) => collection.trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right));
    if (normalizedCollections.length === 0) {
        throw new Error("Select at least one Firestore collection");
    }
    const dateRange = resolveDateRange(dateRangeInput);
    const exportedCollections = await Promise.all(normalizedCollections.map(async (collectionName) => {
        const collectionRef = firebaseAdmin_1.firestore.collection(collectionName);
        const tree = await exportCollectionTree(collectionRef, dateRangeInput);
        return buildCollectionMetadata(collectionName, tree.documents, tree.scannedDocuments, sections);
    }));
    return {
        exportedAt: new Date().toISOString(),
        filters: {
            collections: normalizedCollections,
            sections,
            fromDate: dateRange.fromDateInput,
            toDate: dateRange.toDateInput,
        },
        collections: exportedCollections,
    };
}
