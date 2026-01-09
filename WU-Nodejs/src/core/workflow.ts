export function printWorkflowStatus(submission: any) {
  const wf = submission?.workflowStatus;
  if (!wf || typeof wf !== "object") return;
  const step = wf?.currentStep ?? "";
  const state = wf?.state ?? "";
  if (String(step).trim() || String(state).trim()) {
    console.log(`  workflow: step=${step} state=${state}`);
  }
}
