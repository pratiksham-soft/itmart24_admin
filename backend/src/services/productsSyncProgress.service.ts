export type ProductsSyncRunStatus =
  | "idle"
  | "running"
  | "success"
  | "error";

export type ProductsSyncProgress = {
  status: ProductsSyncRunStatus;
  percentage: number;
  totalProducts: number;
  processedProducts: number;
  imported: number;
  skipped: number;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

type UpdateProductsSyncProgressInput = Partial<
  Omit<
    ProductsSyncProgress,
    "percentage" | "startedAt" | "updatedAt" | "completedAt"
  >
> & {
  completedAt?: string | null;
};

const createIdleProgress =
  (): ProductsSyncProgress => ({
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

const getPercentage = (
  processedProducts: number,
  totalProducts: number,
  status: ProductsSyncRunStatus
) => {
  if (status === "success") {
    return 100;
  }

  if (totalProducts <= 0) {
    return status === "running" ? 0 : 0;
  }

  const rawPercentage = Math.round(
    (processedProducts / totalProducts) * 100
  );

  return Math.max(0, Math.min(100, rawPercentage));
};

const setProgress = (
  nextValues: UpdateProductsSyncProgressInput
) => {
  const now = new Date().toISOString();

  currentProgress = {
    ...currentProgress,
    ...nextValues,
    updatedAt: now,
    completedAt:
      nextValues.completedAt !== undefined
        ? nextValues.completedAt
        : currentProgress.completedAt,
  };

  currentProgress.percentage = getPercentage(
    currentProgress.processedProducts,
    currentProgress.totalProducts,
    currentProgress.status
  );
};

export function getProductsSyncProgress(): ProductsSyncProgress {
  return { ...currentProgress };
}

export function isProductsSyncRunning() {
  return currentProgress.status === "running";
}

export function startProductsSyncProgress() {
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

export function updateProductsSyncProgress(
  nextValues: UpdateProductsSyncProgressInput
) {
  setProgress(nextValues);
  return getProductsSyncProgress();
}

export function completeProductsSyncProgress(
  message = "Shopify sync completed."
) {
  const completedAt = new Date().toISOString();

  setProgress({
    status: "success",
    message,
    completedAt,
  });

  currentProgress.percentage = 100;

  return getProductsSyncProgress();
}

export function failProductsSyncProgress(
  message: string
) {
  const completedAt = new Date().toISOString();

  setProgress({
    status: "error",
    message,
    completedAt,
  });

  return getProductsSyncProgress();
}
