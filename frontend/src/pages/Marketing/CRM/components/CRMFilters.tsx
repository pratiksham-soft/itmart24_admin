import InputField from "../../../../components/form/input/InputField";
import Button from "../../../../components/ui/button/Button";
import type { CRMOption } from "../types/crm.types";

type FilterConfig = {
  key: string;
  label: string;
  options: CRMOption[];
};

type CRMFiltersProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterValues: Record<string, string>;
  filterConfigs: FilterConfig[];
  onFilterChange: (key: string, value: string) => void;
  onReset: () => void;
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function CRMFilters({
  searchValue,
  onSearchChange,
  filterValues,
  filterConfigs,
  onFilterChange,
  onReset,
}: CRMFiltersProps) {
  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
        <InputField
          placeholder="Search by name, email, company, source, type..."
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />

        {filterConfigs.map((config) => (
          <select
            key={config.key}
            value={filterValues[config.key] || ""}
            onChange={(event) => onFilterChange(config.key, event.target.value)}
            className={selectClassName}
          >
            <option value="">{config.label}</option>
            {config.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}

        <Button type="button" variant="outline" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
