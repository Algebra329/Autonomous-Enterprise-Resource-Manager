import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';

export const queryKeys = {
  health: ['health'] as const,
  mandates: ['mandates'] as const,
  proposals: ['proposals'] as const,
  orders: ['orders'] as const,
  ledger: (type?: string) => ['ledger', type ?? 'all'] as const,
  breaker: ['breaker'] as const,
  runs: ['runs'] as const,
  backtest: ['backtest'] as const,
  spend: ['dashboard', 'spend'] as const,
  seatSavings: ['dashboard', 'seat_savings'] as const,
  arena: ['arena', 'summary'] as const,
};

export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.getHealth,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useProposalsQuery() {
  return useQuery({
    queryKey: queryKeys.proposals,
    queryFn: () => api.listProposals(),
    refetchInterval: 20_000,
  });
}

export function useMandatesQuery() {
  return useQuery({
    queryKey: queryKeys.mandates,
    queryFn: () => api.listMandates(),
  });
}

export function useOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.orders,
    queryFn: () => api.listOrders(),
  });
}

export function useLedgerQuery(type?: string) {
  return useQuery({
    queryKey: queryKeys.ledger(type),
    queryFn: () => api.getLedger(type),
  });
}

export function useBreakerQuery() {
  return useQuery({
    queryKey: queryKeys.breaker,
    queryFn: () => api.getBreakerStatus(),
    refetchInterval: 20_000,
  });
}

export function useRunsQuery() {
  return useQuery({
    queryKey: queryKeys.runs,
    queryFn: () => api.listRuns(),
  });
}

export function useBacktestQuery() {
  return useQuery({
    queryKey: queryKeys.backtest,
    queryFn: () => api.runBacktest(),
    staleTime: 120_000,
  });
}

export function useArenaSummaryQuery() {
  return useQuery({
    queryKey: queryKeys.arena,
    queryFn: () => api.getArenaSummary(),
    staleTime: 120_000,
  });
}

export function useInvalidateAerm() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      queryClient.invalidateQueries({ queryKey: queryKeys.mandates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.proposals }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
      queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.breaker }),
      queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }, [queryClient]);
}

