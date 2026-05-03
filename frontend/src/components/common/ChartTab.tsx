import { useState } from "react";

type ChartTabValue = "monthly" | "quarterly" | "annually";

interface ChartTabProps {
  value?: ChartTabValue;
  onChange?: (value: ChartTabValue) => void;
}

const ChartTab: React.FC<ChartTabProps> = ({ value, onChange }) => {
  const [internalValue, setInternalValue] = useState<ChartTabValue>("monthly");
  const selected = value ?? internalValue;

  const handleChange = (nextValue: ChartTabValue) => {
    if (onChange) {
      onChange(nextValue);
      return;
    }

    setInternalValue(nextValue);
  };

  const getButtonClass = (option: ChartTabValue) =>
    selected === option
      ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      <button
        onClick={() => handleChange("monthly")}
        className={`px-3 py-2 font-medium w-full rounded-md text-theme-sm hover:text-gray-900   dark:hover:text-white ${getButtonClass(
          "monthly"
        )}`}
      >
        Monthly
      </button>

      <button
        onClick={() => handleChange("quarterly")}
        className={`px-3 py-2 font-medium w-full rounded-md text-theme-sm hover:text-gray-900   dark:hover:text-white ${getButtonClass(
          "quarterly"
        )}`}
      >
        Quarterly
      </button>

      <button
        onClick={() => handleChange("annually")}
        className={`px-3 py-2 font-medium w-full rounded-md text-theme-sm hover:text-gray-900   dark:hover:text-white ${getButtonClass(
          "annually"
        )}`}
      >
        Annually
      </button>
    </div>
  );
};

export default ChartTab;
