import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DEFAULT_BARN_HOURS, type BarnHours } from "@/lib/herd";

const KEY = ["/api/settings/barnHours"];
/** Barn hours for timed doses (saved with the herd's settings) */
export function useBarnHours() {
  const q = useQuery<{ value: any }>({ queryKey: KEY, staleTime: Infinity });
  const v = q.data?.value;
  const hours: BarnHours = v && /^\d\d:\d\d$/.test(v.start) && /^\d\d:\d\d$/.test(v.end) ? v : DEFAULT_BARN_HOURS;
  const save = useMutation({
    mutationFn: async (value: BarnHours) => (await apiRequest("PUT", KEY[0], { value })).json(),
    onSuccess: (d) => queryClient.setQueryData(KEY, d),
  });
  return { hours, save };
}
