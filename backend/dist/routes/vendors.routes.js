"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const router = (0, express_1.Router)();
const normalizeTimestamp = (value) => {
    if (!value) {
        return null;
    }
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value.toDate().toISOString();
    }
    if (typeof value._seconds === "number") {
        return new Date(value._seconds * 1000).toISOString();
    }
    return null;
};
const normalizeFirestoreValue = (value) => {
    if (value instanceof firebase_admin_1.default.firestore.Timestamp) {
        return value.toDate().toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeFirestoreValue(item));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
            accumulator[key] = normalizeFirestoreValue(nestedValue);
            return accumulator;
        }, {});
    }
    return value;
};
const sanitizeUpdatePayload = (value, path = []) => {
    if (Array.isArray(value)) {
        return value.map((item, index) => sanitizeUpdatePayload(item, [...path, String(index)]));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
            if (path.length === 0 &&
                ["id", "createdAt", "updatedAt"].includes(key)) {
                return accumulator;
            }
            if (nestedValue === undefined) {
                return accumulator;
            }
            accumulator[key] = sanitizeUpdatePayload(nestedValue, [...path, key]);
            return accumulator;
        }, {});
    }
    return value;
};
router.get("/", async (_req, res) => {
    try {
        const snapshot = await firebase_1.firestore
            .collection("vendor_profile")
            .get();
        const vendors = snapshot.docs
            .map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                businessName: data.businessName ?? "",
                businessType: data.businessType ?? "",
                country: data.country ?? "",
                website: data.website ?? "",
                address: data.address ?? "",
                agreement: Boolean(data.agreement),
                contactEmail: data.contactEmail ?? "",
                contactName: data.contactName ?? "",
                contactPhone: data.contactPhone ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                regNo: data.regNo ?? "",
                taxNumber: data.taxNumber ?? "",
                taxRegistered: data.taxRegistered ?? "",
                onboardingStatus: data.onboardingStatus ?? "",
                logoUrl: data.logoUrl ??
                    data.media?.companyLogo?.url ??
                    "",
                coverPhotoUrl: data.coverPhotoUrl ?? "",
                introVideoUrl: data.introVideoUrl ?? "",
                createdAt: normalizeTimestamp(data.createdAt),
                updatedAt: normalizeTimestamp(data.updatedAt),
            };
        })
            .sort((left, right) => {
            const rightTime = right.createdAt
                ? new Date(right.createdAt).getTime()
                : 0;
            const leftTime = left.createdAt
                ? new Date(left.createdAt).getTime()
                : 0;
            return rightTime - leftTime;
        });
        res.json({
            success: true,
            count: vendors.length,
            data: vendors,
        });
    }
    catch (error) {
        console.error("Failed to fetch vendors:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch vendors",
        });
    }
});
router.get("/:vendorId", async (req, res) => {
    try {
        const vendorDoc = await firebase_1.firestore
            .collection("vendor_profile")
            .doc(req.params.vendorId)
            .get();
        if (!vendorDoc.exists) {
            res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
            return;
        }
        const normalizedVendor = normalizeFirestoreValue(vendorDoc.data() ?? {});
        res.json({
            success: true,
            data: {
                id: vendorDoc.id,
                ...normalizedVendor,
            },
        });
    }
    catch (error) {
        console.error("Failed to fetch vendor details:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch vendor details",
        });
    }
});
router.patch("/:vendorId", async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object") {
            res.status(400).json({
                success: false,
                message: "Invalid vendor payload",
            });
            return;
        }
        const vendorRef = firebase_1.firestore
            .collection("vendor_profile")
            .doc(req.params.vendorId);
        const existingVendor = await vendorRef.get();
        if (!existingVendor.exists) {
            res.status(404).json({
                success: false,
                message: "Vendor not found",
            });
            return;
        }
        const sanitizedPayload = sanitizeUpdatePayload(req.body);
        await vendorRef.set({
            ...sanitizedPayload,
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const updatedVendor = await vendorRef.get();
        const normalizedVendor = normalizeFirestoreValue(updatedVendor.data() ?? {});
        res.json({
            success: true,
            message: "Vendor updated successfully",
            data: {
                id: updatedVendor.id,
                ...normalizedVendor,
            },
        });
    }
    catch (error) {
        console.error("Failed to update vendor:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update vendor",
        });
    }
});
exports.default = router;
