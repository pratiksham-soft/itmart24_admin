import React from "react";

type StatusPopupsProps = {
  isUpdating: boolean;
  successMessage: string | null;
  onCloseSuccess: () => void;
};

const StatusPopups: React.FC<StatusPopupsProps> = ({
  isUpdating,
  successMessage,
  onCloseSuccess,
}) => {
  return (
    <>
      {/* Waiting Popup */}
      {isUpdating && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm font-medium text-gray-700">
                Updating product status, please wait…
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Success Popup */}
      {successMessage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-white px-6 py-5 shadow-xl text-center">
            <h3 className="mb-2 text-lg font-semibold text-green-600">
              Success
            </h3>
            <p className="mb-4 text-sm text-gray-700">
              {successMessage}
            </p>
            <button
              onClick={onCloseSuccess}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default StatusPopups;
