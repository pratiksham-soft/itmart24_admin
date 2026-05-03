import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import Badge from "../ui/badge/Badge";
import type { DashboardMonthlyTarget } from "../../types/dashboard";

type MonthlyTargetProps = {
  target: DashboardMonthlyTarget | null;
  todayRevenue: number;
  isLoading: boolean;
  error: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

const getProgressColor = (progressPct: number) => {
  if (progressPct >= 75) {
    return "#12B76A";
  }

  if (progressPct >= 40) {
    return "#F79009";
  }

  return "#F04438";
};

const getProgressTone = (progressPct: number) => {
  if (progressPct >= 75) {
    return "success" as const;
  }

  if (progressPct >= 40) {
    return "warning" as const;
  }

  return "error" as const;
};

export default function MonthlyTarget({
  target,
  todayRevenue,
  isLoading,
  error,
}: MonthlyTargetProps) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const progressPct = Math.max(0, Math.min(100, target?.progressPct ?? 0));
  const progressColor = getProgressColor(progressPct);
  const options: ApexOptions = {
    colors: [progressColor],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radialBar",
      height: 330,
      sparkline: {
        enabled: true,
      },
    },
    plotOptions: {
      radialBar: {
        startAngle: -85,
        endAngle: 85,
        hollow: {
          size: "80%",
        },
        track: {
          background: "#E4E7EC",
          strokeWidth: "100%",
          margin: 5,
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            fontSize: "36px",
            fontWeight: "600",
            offsetY: -40,
            color: "#1D2939",
            formatter: (value) => `${Math.round(value)}%`,
          },
        },
      },
    },
    fill: {
      type: "solid",
      colors: [progressColor],
    },
    stroke: {
      lineCap: "round",
    },
    labels: ["Progress"],
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Monthly Target
            </h3>
            <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
              Revenue-led progress against the active monthly business target.
            </p>
          </div>
          <div className="flex items-start gap-2">
            {target ? (
              <Badge size="sm" color={getProgressTone(progressPct)}>
                {target.isSuggested ? "Suggested" : target.status}
              </Badge>
            ) : null}
            <div className="relative inline-block">
              <button className="dropdown-toggle" onClick={toggleDropdown}>
                <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 size-6" />
              </button>
              <Dropdown
                isOpen={isOpen}
                onClose={closeDropdown}
                className="w-40 p-2"
              >
                <DropdownItem
                  onItemClick={closeDropdown}
                  className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                  Current month
                </DropdownItem>
              </Dropdown>
            </div>
          </div>
        </div>

        <div className="relative">
          {isLoading ? (
            <div className="flex h-[330px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Loading target progress...
            </div>
          ) : error ? (
            <div className="flex h-[330px] items-center justify-center text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          ) : target ? (
            <>
              <div className="max-h-[330px]" id="chartDarkStyle">
                <Chart
                  options={options}
                  series={[progressPct]}
                  type="radialBar"
                  height={330}
                />
              </div>

              <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-[95%] rounded-full px-3 py-1 text-xs font-medium bg-white shadow-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {target.label}
              </span>
            </>
          ) : (
            <div className="flex h-[330px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              No monthly target has been set yet.
            </div>
          )}
        </div>

        <p className="mx-auto mt-10 w-full max-w-[380px] text-center text-sm text-gray-500 sm:text-base">
          {target
            ? `${formatCurrency(target.actualRevenue)} achieved so far against a ${formatCurrency(
                target.targetRevenue
              )} revenue target. Subscription target: ${target.actualSubscriptions}/${target.targetSubscriptions}.`
            : "Create a monthly target to keep revenue, subscription, and vendor onboarding goals visible."}
        </p>
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-3.5 sm:gap-8 sm:py-5">
        <div>
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Target
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {target ? formatCurrency(target.targetRevenue) : "--"}
          </p>
        </div>

        <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>

        <div>
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Achieved
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {target ? formatCurrency(target.actualRevenue) : "--"}
          </p>
        </div>

        <div className="w-px bg-gray-200 h-7 dark:bg-gray-800"></div>

        <div>
          <p className="mb-1 text-center text-gray-500 text-theme-xs dark:text-gray-400 sm:text-sm">
            Today
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {formatCurrency(todayRevenue)}
          </p>
        </div>
      </div>
    </div>
  );
}
