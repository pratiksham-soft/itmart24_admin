import axios from "axios";
import type { DashboardOverview } from "../types/dashboard";

export const fetchDashboardOverview = async () => {
  const response = await axios.get<DashboardOverview>("/api/dashboard/overview");
  return response.data;
};
