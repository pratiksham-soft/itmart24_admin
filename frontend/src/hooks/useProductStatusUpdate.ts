import { useState } from "react";

type LifecycleStatus =
  | "active"
  | "pending"
  | "rejected"
  | "on-hold";
type UseProductStatusUpdateProps = {
  onSuccess?: () => Promise<void>;
};

export const useProductStatusUpdate = ({
  onSuccess,
}: UseProductStatusUpdateProps = {}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }

    return "Failed to update status";
  };

  const updateStatus = async (
  productId: string,
  status: LifecycleStatus
  ) => {
    setIsUpdating(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/products/${productId}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lifecycleStatus: status,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = errorText || "Status update failed";

        try {
          const parsedError = JSON.parse(errorText);
          errorMessage = parsedError.message || errorMessage;
        } catch {
          // Keep the original response text.
        }

        console.error("STATUS UPDATE ERROR:", errorMessage);
        throw new Error(errorMessage);
      }

      if (onSuccess) {
        await onSuccess();
      }

      setSuccessMessage("Product status updated successfully.");
    } catch (error) {
      console.error("UPDATE STATUS FAILED:", error);
      alert(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  };

  const updateStatusBulk = async (
  productIds: string[],
  status: LifecycleStatus
) => {
  if (productIds.length === 0) {
    alert("No products selected");
    return;
  }

  setIsUpdating(true);

  try {
    await Promise.all(
      productIds.map(async (productId) => {
        const response = await fetch(`http://localhost:5000/api/products/${productId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lifecycleStatus: status,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = errorText || "Status update failed";

          try {
            const parsedError = JSON.parse(errorText);
            errorMessage = parsedError.message || errorMessage;
          } catch {
            // Keep the original response text.
          }

          throw new Error(errorMessage);
        }
      })
    );

    if (onSuccess) {
      await onSuccess();
    }

    setSuccessMessage(
      `${productIds.length} products updated successfully.`
    );
  } catch (error) {
    alert(getErrorMessage(error));
  } finally {
    setIsUpdating(false);
  }
};

    return {
    isUpdating,
    successMessage,
    setSuccessMessage,
    updateStatus,
    updateStatusBulk,
    };
};
