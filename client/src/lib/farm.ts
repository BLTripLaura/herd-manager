import { useQuery } from "@tanstack/react-query";

export type FarmInfo = { farmName: string; setupNeeded: boolean; missing: string[] };
export const FARM_KEY = ["/api/auth/farm"];
export async function fetchFarm(): Promise<FarmInfo> {
  const r = await fetch("/api/auth/farm", { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "The herd app couldn't start. Try again in a minute.");
  return j;
}
export const useFarm = () => useQuery<FarmInfo>({ queryKey: FARM_KEY, queryFn: fetchFarm, staleTime: 5 * 60 * 1000, retry: 1 });
/** "Smith Farm", or a plain label before setup */
export const useFarmName = () => useFarm().data?.farmName || "";
export const appTitle = (farm: string) => (farm ? `${farm} Herd Manager` : "Herd Manager");
