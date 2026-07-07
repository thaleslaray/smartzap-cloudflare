import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
export type CampaignWorkflowParams = { campaignId: string }
export class CampaignSendWorkflow extends WorkflowEntrypoint<Env, CampaignWorkflowParams> {
  async run(_event: WorkflowEvent<CampaignWorkflowParams>, _step: WorkflowStep) {}
}
