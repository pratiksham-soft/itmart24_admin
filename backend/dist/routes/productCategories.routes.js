"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebaseAdmin_1 = require("../config/firebaseAdmin");
const router = (0, express_1.Router)();
const generateSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "");
};
/**
 * CREATE MAIN CATEGORY
 */
router.post("/main-category", async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Main category name is required" });
        }
        const slug = generateSlug(name);
        const docRef = await firebaseAdmin_1.firestore.collection("product_categories").add({
            name,
            slug,
            isActive: true,
            isDeleted: false,
            order: Date.now(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return res.status(201).json({
            message: "Main category created successfully",
            id: docRef.id,
        });
    }
    catch (error) {
        console.error("Error creating main category:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});
/**
 * CREATE SUB CATEGORY
 */
router.post("/sub-category", async (req, res) => {
    try {
        const { mainCategoryId, name } = req.body;
        if (!mainCategoryId || !name) {
            return res
                .status(400)
                .json({ message: "Main category ID and name are required" });
        }
        const slug = generateSlug(name);
        const docRef = await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainCategoryId)
            .collection("subcategories")
            .add({
            name,
            slug,
            isActive: true,
            isDeleted: false,
            order: Date.now(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return res.status(201).json({
            message: "Sub category created successfully",
            id: docRef.id,
        });
    }
    catch (error) {
        console.error("Error creating sub category:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});
/**
 * CREATE SUB SUB CATEGORY
 */
router.post("/sub-sub-category", async (req, res) => {
    try {
        const { mainCategoryId, subCategoryId, name } = req.body;
        if (!mainCategoryId || !subCategoryId || !name) {
            return res.status(400).json({
                message: "Main category ID, Sub category ID and name are required",
            });
        }
        const slug = generateSlug(name);
        const docRef = await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainCategoryId)
            .collection("subcategories")
            .doc(subCategoryId)
            .collection("subsubcategories")
            .add({
            name,
            slug,
            isActive: true,
            isDeleted: false,
            order: Date.now(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        return res.status(201).json({
            message: "Sub sub category created successfully",
            id: docRef.id,
        });
    }
    catch (error) {
        console.error("Error creating sub sub category:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});
/**
 * GET FULL CATEGORY TREE
 */
router.get("/", async (req, res) => {
    try {
        // 1️⃣ Fetch all main categories
        const mainSnapshot = await firebaseAdmin_1.firestore
            .collection("product_categories")
            .where("isDeleted", "in", [false, null])
            .orderBy("order", "asc")
            .get();
        const mains = mainSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            subcategories: [],
        }));
        // 2️⃣ Fetch all subcategories in parallel
        await Promise.all(mains.map(async (main) => {
            const subSnapshot = await firebaseAdmin_1.firestore
                .collection("product_categories")
                .doc(main.id)
                .collection("subcategories")
                .where("isDeleted", "in", [false, null])
                .orderBy("order", "asc")
                .get();
            const subs = subSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                subsubcategories: [],
            }));
            main.subcategories = subs;
            // 3️⃣ Fetch subsubcategories in parallel
            await Promise.all(subs.map(async (sub) => {
                const subSubSnapshot = await firebaseAdmin_1.firestore
                    .collection("product_categories")
                    .doc(main.id)
                    .collection("subcategories")
                    .doc(sub.id)
                    .collection("subsubcategories")
                    .where("isDeleted", "in", [false, null])
                    .orderBy("order", "asc")
                    .get();
                sub.subsubcategories = subSubSnapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
            }));
        }));
        return res.json(mains);
    }
    catch (error) {
        console.error("Error fetching categories:", error);
        return res.status(500).json({ message: "Fetch failed" });
    }
});
/**
 * SOFT DELETE MAIN CATEGORY (CASCADE READY)
 * CASCADE SOFT DELETE MAIN CATEGORY
 */
router.patch("/main-category/:id/delete", async (req, res) => {
    try {
        const id = req.params.id;
        const mainRef = firebaseAdmin_1.firestore.collection("product_categories").doc(id);
        // 1️⃣ Soft delete main category
        await mainRef.update({
            isDeleted: true,
            updatedAt: new Date(),
        });
        // 2️⃣ Get all subcategories
        const subSnapshot = await mainRef.collection("subcategories").get();
        for (const subDoc of subSnapshot.docs) {
            const subRef = subDoc.ref;
            // Soft delete subcategory
            await subRef.update({
                isDeleted: true,
                updatedAt: new Date(),
            });
            // 3️⃣ Get sub-subcategories
            const subSubSnapshot = await subRef
                .collection("subsubcategories")
                .get();
            for (const subSubDoc of subSubSnapshot.docs) {
                await subSubDoc.ref.update({
                    isDeleted: true,
                    updatedAt: new Date(),
                });
            }
        }
        return res.json({ message: "Category cascade soft deleted" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Cascade delete failed" });
    }
});
/**
 * CASCADE SOFT DELETE SUB CATEGORY
 */
router.patch("/sub-category/:mainId/:subId/delete", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const subRef = firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId);
        // Soft delete subcategory
        await subRef.update({
            isDeleted: true,
            updatedAt: new Date(),
        });
        // Cascade to sub-subcategories
        const subSubSnapshot = await subRef
            .collection("subsubcategories")
            .get();
        for (const subSubDoc of subSubSnapshot.docs) {
            await subSubDoc.ref.update({
                isDeleted: true,
                updatedAt: new Date(),
            });
        }
        return res.json({ message: "Sub category cascade deleted" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Delete failed" });
    }
});
/**
 * SOFT DELETE SUB SUB CATEGORY
 */
router.patch("/sub-sub-category/:mainId/:subId/:subSubId/delete", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const subSubId = req.params.subSubId;
        await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId)
            .collection("subsubcategories")
            .doc(subSubId)
            .update({
            isDeleted: true,
            updatedAt: new Date(),
        });
        return res.json({ message: "Sub sub category deleted" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Delete failed" });
    }
});
/**
 * UPDATE MAIN CATEGORY
 */
router.patch("/main-category/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const { name, isActive } = req.body;
        const updateData = {
            updatedAt: new Date(),
        };
        if (name) {
            updateData.name = name;
            updateData.slug = generateSlug(name);
        }
        if (typeof isActive === "boolean") {
            updateData.isActive = isActive;
        }
        await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(id)
            .update(updateData);
        return res.json({ message: "Main category updated" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Update failed" });
    }
});
/**
 * UPDATE SUB CATEGORY
 */
router.patch("/sub-category/:mainId/:subId", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const { name, isActive } = req.body;
        const updateData = {
            updatedAt: new Date(),
        };
        if (name) {
            updateData.name = name;
            updateData.slug = generateSlug(name);
        }
        if (typeof isActive === "boolean") {
            updateData.isActive = isActive;
        }
        await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId)
            .update(updateData);
        return res.json({ message: "Sub category updated" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Update failed" });
    }
});
/**
 * UPDATE SUB SUB CATEGORY
 */
router.patch("/sub-sub-category/:mainId/:subId/:subSubId", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const subSubId = req.params.subSubId;
        const { name, isActive } = req.body;
        const updateData = {
            updatedAt: new Date(),
        };
        if (name) {
            updateData.name = name;
            updateData.slug = generateSlug(name);
        }
        if (typeof isActive === "boolean") {
            updateData.isActive = isActive;
        }
        await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId)
            .collection("subsubcategories")
            .doc(subSubId)
            .update(updateData);
        return res.json({ message: "Sub sub category updated" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Update failed" });
    }
});
/**
 * RESTORE MAIN CATEGORY (CASCADE)
 */
router.patch("/main-category/:id/restore", async (req, res) => {
    try {
        const id = req.params.id;
        const mainRef = firebaseAdmin_1.firestore.collection("product_categories").doc(id);
        // Restore main
        await mainRef.update({
            isDeleted: false,
            updatedAt: new Date(),
        });
        const subSnapshot = await mainRef.collection("subcategories").get();
        for (const subDoc of subSnapshot.docs) {
            const subRef = subDoc.ref;
            await subRef.update({
                isDeleted: false,
                updatedAt: new Date(),
            });
            const subSubSnapshot = await subRef
                .collection("subsubcategories")
                .get();
            for (const subSubDoc of subSubSnapshot.docs) {
                await subSubDoc.ref.update({
                    isDeleted: false,
                    updatedAt: new Date(),
                });
            }
        }
        return res.json({ message: "Category restored successfully" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Restore failed" });
    }
});
/**
 * RESTORE SUB CATEGORY (CASCADE)
 */
router.patch("/sub-category/:mainId/:subId/restore", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const subRef = firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId);
        await subRef.update({
            isDeleted: false,
            updatedAt: new Date(),
        });
        const subSubSnapshot = await subRef
            .collection("subsubcategories")
            .get();
        for (const subSubDoc of subSubSnapshot.docs) {
            await subSubDoc.ref.update({
                isDeleted: false,
                updatedAt: new Date(),
            });
        }
        return res.json({ message: "Sub category restored" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Restore failed" });
    }
});
/**
 * RESTORE SUB SUB CATEGORY
 */
router.patch("/sub-sub-category/:mainId/:subId/:subSubId/restore", async (req, res) => {
    try {
        const mainId = req.params.mainId;
        const subId = req.params.subId;
        const subSubId = req.params.subSubId;
        await firebaseAdmin_1.firestore
            .collection("product_categories")
            .doc(mainId)
            .collection("subcategories")
            .doc(subId)
            .collection("subsubcategories")
            .doc(subSubId)
            .update({
            isDeleted: false,
            updatedAt: new Date(),
        });
        return res.json({ message: "Sub sub category restored" });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Restore failed" });
    }
});
exports.default = router;
