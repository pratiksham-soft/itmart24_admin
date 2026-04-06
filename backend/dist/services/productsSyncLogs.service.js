"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProductsSyncLog = createProductsSyncLog;
exports.getProductsSyncLogs = getProductsSyncLogs;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const COLLECTION = "products_sync";
const mapProductsSyncLog = (doc) => {
    const data = doc.data();
    const message = typeof data.message === "string" &&
        data.message.trim().length > 0
        ? data.message.trim()
        : undefined;
    let time = typeof data.completedAtIso === "string"
        ? data.completedAtIso
        : "";
    if (!time &&
        data.completedAt &&
        typeof data.completedAt.toDate === "function") {
        time = data.completedAt.toDate().toISOString();
    }
    return {
        id: doc.id,
        time: time || new Date(0).toISOString(),
        imported: typeof data.imported === "number"
            ? data.imported
            : 0,
        skipped: typeof data.skipped === "number"
            ? data.skipped
            : 0,
        status: data.status === "error"
            ? "error"
            : "success",
        message,
    };
};
async function createProductsSyncLog(input) {
    const docRef = firebase_1.firestore.collection(COLLECTION).doc();
    const completedAtIso = new Date().toISOString();
    const message = input.message?.trim();
    await docRef.set({
        imported: input.imported,
        skipped: input.skipped,
        status: input.status,
        message: message || null,
        completedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        completedAtIso,
        createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
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
async function getProductsSyncLogs(limit = 50) {
    const snapshot = await firebase_1.firestore
        .collection(COLLECTION)
        .orderBy("completedAt", "desc")
        .limit(limit)
        .get();
    return snapshot.docs.map(mapProductsSyncLog);
}
