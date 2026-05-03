import axios from "axios";
import type {
  MonthlyTargetRecord,
  MonthlyTargetRecommendation,
} from "../types/monthlyTarget";

type MonthlyTargetPayload = {
  targetRevenue: number;
  targetSubscriptions: number;
  targetVendorOnboarding: number;
  remarks: string;
  status: string;
};

export const fetchMonthlyTargets = async () => {
  const response = await axios.get<MonthlyTargetRecord[]>("/api/monthly-targets");
  return response.data;
};

export const fetchMonthlyTargetRecommendation = async (month: string) => {
  const response = await axios.get<MonthlyTargetRecommendation>(
    `/api/monthly-targets/recommendation?month=${month}`
  );
  return response.data;
};

export const saveMonthlyTarget = async (
  month: string,
  payload: MonthlyTargetPayload
) => {
  const response = await axios.put<MonthlyTargetRecord>(
    `/api/monthly-targets/${month}`,
    payload
  );
  return response.data;
};
