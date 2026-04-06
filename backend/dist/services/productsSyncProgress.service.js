"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductsSyncProgress = getProductsSyncProgress;
exports.isProductsSyncRunning = isProductsSyncRunning;
exports.startProductsSyncProgress = startProductsSyncProgress;
exports.updateProductsSyncProgress = updateProductsSyncProgress;
exports.completeProductsSyncProgress = completeProductsSyncProgress;
exports.failProductsSyncProgress = failProductsSyncProgress;
const createIdleProgress = () => ({
    status: "idle",
    percentage: 0,
    totalProducts: 0,
    processedProducts: 0,
    imported: 0,
    skipped: 0,
    message: "No sync is currently running.",
    startedAt: null,
    updatedAt: null,
    completedAt: null,
});
let currentProgress = createIdleProgress();
const getPercentage = (processedProducts, totalProducts, status) => {
    if (status === "success") {
        return 100;
    }
    if (totalProducts <= 0) {
        return status === "running" ? 0 : 0;
    }
    const rawPercentage = Math.round((processedProducts / totalProducts) * 100);
    return Math.max(0, Math.min(100, rawPercentage));
};
const setProgress = (nextValues) => {
    const now = new Date().toISOString();
    currentProgress = {
        ...currentProgress,
        ...nextValues,
        updatedAt: now,
        completedAt: nextValues.completedAt !== undefined
            ? nextValues.completedAt
            : currentProgress.completedAt,
    };
    currentProgress.percentage = getPercentage(currentProgress.processedProducts, currentProgress.totalProducts, currentProgress.status);
};
function getProductsSyncProgress() {
    return { ...currentProgress };
}
function isProductsSyncRunning() {
    return currentProgress.status === "running";
}
function startProductsSyncProgress() {
    const startedAt = new Date().toISOString();
    currentProgress = {
        status: "running",
        percentage: 0,
        totalProducts: 0,
        processedProducts: 0,
        imported: 0,
        skipped: 0,
        message: "Preparing Shopify sync...",
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
    };
    return getProductsSyncProgress();
}
function updateProductsSyncProgress(nextValues) {
    setProgress(nextValues);
    return getProductsSyncProgress();
}
function completeProductsSyncProgress(message = "Shopify sync completed.") {
    const completedAt = new Date().toISOString();
    setProgress({
        status: "success",
        message,
        completedAt,
    });
    currentProgress.percentage = 100;
    return getProductsSyncProgress();
}
function failProductsSyncProgress(message) {
    const completedAt = new Date().toISOString();
    setProgress({
        status: "error",
        message,
        completedAt,
    });
    return getProductsSyncProgress();
}
