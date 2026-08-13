import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

type SetupHealthParams = { probe: string };

export class SetupHealthWorkflow extends WorkflowEntrypoint<Env, SetupHealthParams> {
  async run(event: WorkflowEvent<SetupHealthParams>, step: WorkflowStep) {
    return step.do("health", async () => ({
      ok: event.payload.probe === "smartzap-setup",
      checkedAt: new Date().toISOString(),
    }));
  }
}
