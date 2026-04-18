import admin from "firebase-admin";
import { firestore } from "../config/firebaseAdmin";

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

export type ExportedDocument = JsonObject & {
  id: string;
  _subcollections?: Record<
    string,
    ExportedDocument[]
  >;
};

export type FirestoreExportSections = {
  schema: boolean;
  structure: boolean;
  dataFields: boolean;
  values: boolean;
  topDocuments: boolean;
};

export type FirestoreExportDateRange = {
  fromDate?: string | null;
  toDate?: string | null;
};

export type FirestoreCollectionExport = {
  collection: string;
  scannedDocuments: number;
  exportedDocuments: number;
  schema?: Record<string, string[]>;
  structure?: {
    documentCount: number;
    subcollections: Array<{
      path: string;
      documentCount: number;
    }>;
  };
  dataFields?: string[];
  values?: ExportedDocument[];
  top10Documents?: ExportedDocument[];
};

export type FirestoreExportPayload = {
  exportedAt: string;
  filters: {
    collections: string[];
    sections: FirestoreExportSections;
    fromDate: string | null;
    toDate: string | null;
  };
  collections: FirestoreCollectionExport[];
};

type ResolvedDateRange = {
  fromDate: Date | null;
  toDate: Date | null;
  fromDateInput: string | null;
  toDateInput: string | null;
};

type ExportedCollectionTree = {
  documents: ExportedDocument[];
  scannedDocuments: number;
};

const DATE_ONLY_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(
  value: JsonValue
): value is JsonObject {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function parseDateBoundary(
  value: string | null | undefined,
  boundary: "start" | "end"
) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const candidate = DATE_ONLY_PATTERN.test(
    trimmed
  )
    ? new Date(
        `${trimmed}T${
          boundary === "start"
            ? "00:00:00.000"
            : "23:59:59.999"
        }Z`
      )
    : new Date(trimmed);

  if (
    Number.isNaN(candidate.getTime())
  ) {
    throw new Error(
      `Invalid ${
        boundary === "start"
          ? "fromDate"
          : "toDate"
      } value`
    );
  }

  return candidate;
}

function resolveDateRange(
  input: FirestoreExportDateRange = {}
): ResolvedDateRange {
  const fromDateInput =
    input.fromDate?.trim() || null;
  const toDateInput =
    input.toDate?.trim() || null;
  const fromDate = parseDateBoundary(
    fromDateInput,
    "start"
  );
  const toDate = parseDateBoundary(
    toDateInput,
    "end"
  );

  if (
    fromDate &&
    toDate &&
    fromDate.getTime() > toDate.getTime()
  ) {
    throw new Error(
      "From Date cannot be later than To Date"
    );
  }

  return {
    fromDate,
    toDate,
    fromDateInput,
    toDateInput,
  };
}

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
    return Object.entries(
      value as Record<string, unknown>
    ).reduce<JsonObject>(
      (accumulator, [key, nestedValue]) => {
        accumulator[key] =
          serializeValue(nestedValue);
        return accumulator;
      },
      {}
    );
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

function collectDateCandidates(
  value: unknown,
  path: string[] = []
): Date[] {
  if (
    value instanceof admin.firestore.Timestamp
  ) {
    return [value.toDate()];
  }

  if (value instanceof Date) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectDateCandidates(item, path)
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(
      value as Record<string, unknown>
    ).flatMap(([key, nestedValue]) =>
      collectDateCandidates(nestedValue, [
        ...path,
        key,
      ])
    );
  }

  const currentKey =
    path[path.length - 1] ?? "";
  const looksLikeDateField =
    /(date|at)$/i.test(currentKey);

  if (
    looksLikeDateField &&
    (typeof value === "string" ||
      typeof value === "number")
  ) {
    const candidate = new Date(value);

    if (
      !Number.isNaN(candidate.getTime())
    ) {
      return [candidate];
    }
  }

  return [];
}

function matchesDateRange(
  data: FirebaseFirestore.DocumentData,
  dateRange: ResolvedDateRange
) {
  if (
    !dateRange.fromDate &&
    !dateRange.toDate
  ) {
    return true;
  }

  const candidates =
    collectDateCandidates(data);

  if (candidates.length === 0) {
    return false;
  }

  return candidates.some((candidate) => {
    if (
      dateRange.fromDate &&
      candidate.getTime() <
        dateRange.fromDate.getTime()
    ) {
      return false;
    }

    if (
      dateRange.toDate &&
      candidate.getTime() >
        dateRange.toDate.getTime()
    ) {
      return false;
    }

    return true;
  });
}

function getExportValueType(
  value: JsonValue
): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (
    isPlainObject(value) &&
    typeof value._type === "string"
  ) {
    return value._type;
  }

  if (typeof value === "object") {
    return "object";
  }

  return typeof value;
}

function collectValueMetadata(
  value: JsonValue,
  path: string,
  fieldPaths: Set<string>,
  schemaMap: Map<string, Set<string>>
) {
  fieldPaths.add(path);

  const currentTypes =
    schemaMap.get(path) ?? new Set<string>();
  currentTypes.add(getExportValueType(value));
  schemaMap.set(path, currentTypes);

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectValueMetadata(
        item,
        `${path}[]`,
        fieldPaths,
        schemaMap
      )
    );
    return;
  }

  if (
    isPlainObject(value) &&
    typeof value._type === "string"
  ) {
    return;
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(
      ([key, nestedValue]) => {
        collectValueMetadata(
          nestedValue,
          `${path}.${key}`,
          fieldPaths,
          schemaMap
        );
      }
    );
  }
}

function collectDocumentMetadata(
  document: ExportedDocument,
  fieldPaths: Set<string>,
  schemaMap: Map<string, Set<string>>,
  subcollectionCounts: Map<string, number>,
  subcollectionPrefix = ""
) {
  Object.entries(document).forEach(
    ([key, value]) => {
      if (
        key === "id" ||
        key === "_subcollections"
      ) {
        return;
      }

      collectValueMetadata(
        value,
        key,
        fieldPaths,
        schemaMap
      );
    }
  );

  Object.entries(
    document._subcollections ?? {}
  ).forEach(
    ([subcollectionName, documents]) => {
      const path = subcollectionPrefix
        ? `${subcollectionPrefix}/${subcollectionName}`
        : subcollectionName;

      subcollectionCounts.set(
        path,
        (subcollectionCounts.get(path) ?? 0) +
          documents.length
      );

      documents.forEach((nestedDocument) =>
        collectDocumentMetadata(
          nestedDocument,
          fieldPaths,
          schemaMap,
          subcollectionCounts,
          path
        )
      );
    }
  );
}

function buildCollectionMetadata(
  collectionName: string,
  documents: ExportedDocument[],
  scannedDocuments: number,
  sections: FirestoreExportSections
): FirestoreCollectionExport {
  const fieldPaths = new Set<string>();
  const schemaMap = new Map<
    string,
    Set<string>
  >();
  const subcollectionCounts = new Map<
    string,
    number
  >();

  documents.forEach((document) =>
    collectDocumentMetadata(
      document,
      fieldPaths,
      schemaMap,
      subcollectionCounts
    )
  );

  const result: FirestoreCollectionExport = {
    collection: collectionName,
    scannedDocuments,
    exportedDocuments: documents.length,
  };

  if (sections.schema) {
    result.schema = Array.from(
      schemaMap.entries()
    )
      .sort(([left], [right]) =>
        left.localeCompare(right)
      )
      .reduce<Record<string, string[]>>(
        (
          accumulator,
          [path, valueTypes]
        ) => {
          accumulator[path] = Array.from(
            valueTypes
          ).sort((left, right) =>
            left.localeCompare(right)
          );
          return accumulator;
        },
        {}
      );
  }

  if (sections.structure) {
    result.structure = {
      documentCount: documents.length,
      subcollections: Array.from(
        subcollectionCounts.entries()
      )
        .sort(([left], [right]) =>
          left.localeCompare(right)
        )
        .map(([path, documentCount]) => ({
          path,
          documentCount,
        })),
    };
  }

  if (sections.dataFields) {
    result.dataFields = Array.from(
      fieldPaths
    ).sort((left, right) =>
      left.localeCompare(right)
    );
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

export async function listFirestoreRootCollections() {
  const collections =
    await firestore.listCollections();

  return collections
    .map((collection) => collection.id)
    .sort((left, right) =>
      left.localeCompare(right)
    );
}

export async function exportCollectionTree(
  collectionRef: FirebaseFirestore.CollectionReference,
  input: FirestoreExportDateRange = {}
): Promise<ExportedCollectionTree> {
  const dateRange =
    resolveDateRange(input);
  const snapshot =
    await collectionRef.get();
  const documents: ExportedDocument[] = [];

  for (const doc of [...snapshot.docs].sort(
    (left, right) =>
      left.id.localeCompare(right.id)
  )) {
    const rawData = doc.data();

    if (
      !matchesDateRange(rawData, dateRange)
    ) {
      continue;
    }

    const subcollections = (
      await doc.ref.listCollections()
    ).sort((left, right) =>
      left.id.localeCompare(right.id)
    );

    const serializedDoc: ExportedDocument = {
      id: doc.id,
      ...serializeDocumentData(rawData),
    };

    if (subcollections.length > 0) {
      const nestedCollections: Record<
        string,
        ExportedDocument[]
      > = {};

      for (const subcollection of subcollections) {
        const nestedExport =
          await exportCollectionTree(
            subcollection,
            input
          );

        if (
          nestedExport.documents.length > 0
        ) {
          nestedCollections[
            subcollection.id
          ] = nestedExport.documents;
        }
      }

      if (
        Object.keys(nestedCollections).length >
        0
      ) {
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

export async function buildFirestoreExport(
  collections: string[],
  sections: FirestoreExportSections,
  dateRangeInput: FirestoreExportDateRange = {}
): Promise<FirestoreExportPayload> {
  const normalizedCollections =
    Array.from(
      new Set(
        collections
          .map((collection) =>
            collection.trim()
          )
          .filter(Boolean)
      )
    ).sort((left, right) =>
      left.localeCompare(right)
    );

  if (normalizedCollections.length === 0) {
    throw new Error(
      "Select at least one Firestore collection"
    );
  }

  const dateRange =
    resolveDateRange(dateRangeInput);

  const exportedCollections =
    await Promise.all(
      normalizedCollections.map(
        async (collectionName) => {
          const collectionRef =
            firestore.collection(
              collectionName
            );
          const tree =
            await exportCollectionTree(
              collectionRef,
              dateRangeInput
            );

          return buildCollectionMetadata(
            collectionName,
            tree.documents,
            tree.scannedDocuments,
            sections
          );
        }
      )
    );

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
