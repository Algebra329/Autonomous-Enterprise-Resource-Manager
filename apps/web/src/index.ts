import type { Policy, Proposal } from '@rm/shared';

export interface WebAppState {
  activePolicy: Policy | null;
  pendingProposals: Proposal[];
}

export const initialWebState: WebAppState = {
  activePolicy: null,
  pendingProposals: [],
};

