import type { ReactNode } from "react";
import Button from "../../../../components/ui/button/Button";

type CRMPageHeaderProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  actionsFooter?: ReactNode;
};

export default function CRMPageHeader({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  actionsFooter,
}: CRMPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
          {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      <div className="flex flex-col items-start gap-2 lg:items-end">
        <div className="flex flex-wrap gap-3">
          {secondaryActionLabel && onSecondaryAction ? (
            <Button type="button" variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
          {actionLabel && onAction ? (
            <Button type="button" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
        {actionsFooter}
      </div>
    </div>
  );
}
