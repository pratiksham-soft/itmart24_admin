import Button from "../../../../components/ui/button/Button";
import type { CRMSegmentCondition, CRMOption } from "../types/crm.types";

type SegmentBuilderProps = {
  conditions: CRMSegmentCondition[];
  onChange: (conditions: CRMSegmentCondition[]) => void;
  fieldOptions: CRMOption[];
  operatorOptions: CRMOption[];
};

const selectClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function SegmentBuilder({
  conditions,
  onChange,
  fieldOptions,
  operatorOptions,
}: SegmentBuilderProps) {
  const nextConditions = conditions.length > 0 ? conditions : [{ field: "", operator: "", value: "" }];

  return (
    <div className="space-y-3">
      {nextConditions.map((condition, index) => (
        <div key={index} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900 md:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={condition.field}
            onChange={(event) => {
              const updated = [...nextConditions];
              updated[index] = { ...updated[index], field: event.target.value };
              onChange(updated);
            }}
            className={selectClassName}
          >
            <option value="">Field</option>
            {fieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={condition.operator}
            onChange={(event) => {
              const updated = [...nextConditions];
              updated[index] = { ...updated[index], operator: event.target.value };
              onChange(updated);
            }}
            className={selectClassName}
          >
            <option value="">Operator</option>
            {operatorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={condition.value}
            onChange={(event) => {
              const updated = [...nextConditions];
              updated[index] = { ...updated[index], value: event.target.value };
              onChange(updated);
            }}
            placeholder="Value"
            className={selectClassName}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const updated = nextConditions.filter((_entry, currentIndex) => currentIndex !== index);
              onChange(updated);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...nextConditions, { field: "", operator: "", value: "" }])}
      >
        Add Condition
      </Button>
    </div>
  );
}
