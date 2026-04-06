import admin from "firebase-admin";
import { firestore } from "../config/firebase";

const COLLECTION = "products_sync";

export type ProductsSyncLogStatus =
  | "success"
  | "error";

export type ProductsSyncLog = {
  id: string;
  time: string;
  imported: number;
  skipped: number;
  status: ProductsSyncLogStatus;
  message?: string;
};

type CreateProductsSyncLogInput = {
  imported: number;
  skipped: number;
  status: ProductsSyncLogStatus;
  message?: string;
};

const mapProductsSyncLog = (
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): ProductsSyncLog => {
  const data = doc.data();
  const message =
    typeof data.message === "string" &&
    data.message.trim().length > 0
      ? data.message.trim()
      : undefined;

  let time =
    typeof data.completedAtIso === "string"
      ? data.completedAtIso
      : "";

  if (
    !time &&
    data.completedAt &&
    typeof data.completedAt.toDate === "function"
  ) {
    time = data.completedAt.toDate().toISOString();
  }

  return {
    id: doc.id,
    time: time || new Date(0).toISOString(),
    imported:
      typeof data.imported === "number"
        ? data.imported
        : 0,
    skipped:
      typeof data.skipped === "number"
        ? data.skipped
        : 0,
    status:
      data.status === "error"
        ? "error"
        : "success",
    message,
  };
};

export async function createProductsSyncLog(
  input: CreateProductsSyncLogInput
): Promise<ProductsSyncLog> {
  const docRef = firestore.collection(COLLECTION).doc();
  const completedAtIso = new Date().toISOString();
  const message = input.message?.trim();

  await docRef.set({
    imported: input.imported,
    skipped: input.skipped,
    status: input.status,
    message: message || null,
    completedAt:
      admin.firestore.FieldValue.serverTimestamp(),
    completedAtIso,
    createdAt:
      admin.firestore.FieldValue.serverTimestamp(),
    updatedAt:
      admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    id: docRef.id,
    time: completedAtIso,
    imported: input.imported,
    skipped: input.skipped,
    status: input.status,
    message,
  };
}

export async function getProductsSyncLogs(
  limit = 50
): Promise<ProductsSyncLog[]> {
  const snapshot = await firestore
    .collection(COLLECTION)
    .orderBy("completedAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map(mapProductsSyncLog);
}
