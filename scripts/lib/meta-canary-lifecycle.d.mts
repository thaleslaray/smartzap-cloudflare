export type MetaCanaryContactStatus = { status?: string | null };

export function shouldStopMetaCampaignPolling(input: {
  transportOnly: boolean;
  campaignStatus: string;
  contacts: MetaCanaryContactStatus[];
}): boolean;
