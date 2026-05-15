import { Modal } from "../../../../components/ui/modal";
import Button from "../../../../components/ui/button/Button";

type ConfirmDeleteModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function ConfirmDeleteModal({
  isOpen,
  title,
  description,
  loading,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg p-6 lg:p-8">
      <div className="space-y-5">
        <div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
