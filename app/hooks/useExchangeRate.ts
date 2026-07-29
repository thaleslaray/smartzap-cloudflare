import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export type ExchangeRate = {
  available: true;
  rate: number;
  currency: "BRL";
  pair: "USD/BRL";
  source: "live" | "cache" | "last_valid";
  provider: "awesomeapi" | "exchange-rate-api" | "persisted";
  fetchedAt: string;
  stale: boolean;
};

export function useExchangeRate() {
  return useQuery({
    queryKey: ["pricing", "exchange-rate", "USD-BRL"],
    queryFn: () => api<ExchangeRate>("/api/pricing/exchange-rate"),
    staleTime: 60 * 60 * 1_000,
    gcTime: 24 * 60 * 60 * 1_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
