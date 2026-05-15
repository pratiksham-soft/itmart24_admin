import Badge from "../../../../components/ui/badge/Badge";

type CRMStatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "primary" | "success" | "warning" | "error" | "info" | "light" | "dark";
};

export default function CRMStatCard({
  label,
  value,
  helper,
  tone = "primary",
}: CRMStatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
        </div>
        {helper ? (
          <Badge color={tone} variant="light" size="sm">
            {helper}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
