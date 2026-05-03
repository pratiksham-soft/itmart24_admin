import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import { useState } from "react";
import type { DashboardMonthlyTrend } from "../../types/dashboard";

type MonthlySalesChartProps = {
  data: DashboardMonthlyTrend[];
  isLoading: boolean;
  error: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);

export default function MonthlySalesChart({
  data,
  isLoading,
  error,
}: MonthlySalesChartProps) {
  const categories = data.map((item) => item.label);
  const series = [
    {
      name: "Revenue",
      data: data.map((item) => item.revenue),
    },
  ];
  const hasData = data.some((item) => item.revenue > 0);
  const options: ApexOptions = {
    colors: ["#465fff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 220,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "42%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },
    xaxis: {
      categories,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: {
      labels: {
        formatter: (value) => formatCurrency(Number(value)),
      },
    },
    grid: {
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    fill: {
      opacity: 1,
    },
    tooltip: {
      x: {
        show: false,
      },
      y: {
        formatter: (value: number) => formatCurrency(value),
      },
    },
  };
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Monthly Revenue
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Paid subscription revenue across the last 12 months.
          </p>
        </div>
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
              Revenue trend
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading revenue trend...
          </div>
        ) : error ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : hasData ? (
          <div className="-ml-5 min-w-[650px] xl:min-w-full pl-2">
            <Chart options={options} series={series} type="bar" height={220} />
          </div>
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            No revenue has been recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
