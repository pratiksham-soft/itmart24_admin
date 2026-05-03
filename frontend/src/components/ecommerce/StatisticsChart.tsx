import { useEffect, useRef, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import flatpickr from "flatpickr";
import ChartTab from "../common/ChartTab";
import { CalenderIcon } from "../../icons";
import type { DashboardMonthlyTrend } from "../../types/dashboard";

type StatisticsChartProps = {
  data: DashboardMonthlyTrend[];
  isLoading: boolean;
  error: string | null;
};

type Timeframe = "monthly" | "quarterly" | "annually";

type TrendPoint = {
  label: string;
  subscriptions: number;
  vendors: number;
};

const buildTrendSeries = (
  data: DashboardMonthlyTrend[],
  timeframe: Timeframe
): TrendPoint[] => {
  if (timeframe === "monthly") {
    return data.map((item) => ({
      label: item.label,
      subscriptions: item.subscriptions,
      vendors: item.vendors,
    }));
  }

  const grouped = data.reduce<Record<string, TrendPoint>>((accumulator, item) => {
    const [yearText, monthText] = item.month.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const key =
      timeframe === "quarterly"
        ? `${year}-Q${Math.floor((month - 1) / 3) + 1}`
        : `${year}`;

    if (!accumulator[key]) {
      accumulator[key] = {
        label: timeframe === "quarterly" ? `Q${Math.floor((month - 1) / 3) + 1} ${year}` : String(year),
        subscriptions: 0,
        vendors: 0,
      };
    }

    accumulator[key].subscriptions += item.subscriptions;
    accumulator[key].vendors += item.vendors;
    return accumulator;
  }, {});

  return Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
};

export default function StatisticsChart({
  data,
  isLoading,
  error,
}: StatisticsChartProps) {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("monthly");

  useEffect(() => {
    if (!datePickerRef.current) return;

    const today = new Date();
    const elevenMonthsAgo = new Date();
    elevenMonthsAgo.setMonth(today.getMonth() - 11);

    const fp = flatpickr(datePickerRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "M Y",
      defaultDate: [elevenMonthsAgo, today],
      clickOpens: false,
      prevArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 15L12.5 10L7.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) {
        fp.destroy();
      }
    };
  }, []);

  const chartData = buildTrendSeries(data, timeframe);
  const hasData = chartData.some(
    (item) => item.subscriptions > 0 || item.vendors > 0
  );
  const options: ApexOptions = {
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    colors: ["#465FFF", "#12B76A"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "line",
      toolbar: {
        show: false,
      },
    },
    stroke: {
      curve: "straight",
      width: [2, 2],
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: {
        size: 6,
      },
    },
    grid: {
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      enabled: true,
    },
    xaxis: {
      type: "category",
      categories: chartData.map((item) => item.label),
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    yaxis: {
      labels: {
        style: {
          fontSize: "12px",
          colors: ["#6B7280"],
        },
      },
      title: {
        text: "",
        style: {
          fontSize: "0px",
        },
      },
    },
  };

  const series = [
    {
      name: "New Subscriptions",
      data: chartData.map((item) => item.subscriptions),
    },
    {
      name: "Vendor Onboarding",
      data: chartData.map((item) => item.vendors),
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Business Growth Trends
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Subscription activation and vendor onboarding momentum.
          </p>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <ChartTab value={timeframe} onChange={setTimeframe} />
          <div className="relative inline-flex items-center">
            <CalenderIcon className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-3 lg:top-1/2 lg:translate-x-0 lg:-translate-y-1/2 size-5 text-gray-500 dark:text-gray-400 pointer-events-none z-10" />
            <input
              ref={datePickerRef}
              className="h-10 w-10 lg:w-40 lg:h-auto  lg:pl-10 lg:pr-3 lg:py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-transparent lg:text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:lg:text-gray-300 cursor-default"
              placeholder="Last 12 months"
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex h-[310px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading growth trends...
          </div>
        ) : error ? (
          <div className="flex h-[310px] items-center justify-center text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : hasData ? (
          <div className="min-w-[1000px] xl:min-w-full">
            <Chart options={options} series={series} type="area" height={310} />
          </div>
        ) : (
          <div className="flex h-[310px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Not enough activity yet to plot a trend.
          </div>
        )}
      </div>
    </div>
  );
}
