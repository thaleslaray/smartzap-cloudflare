export function shouldStopMetaCampaignPolling({
  transportOnly,
  campaignStatus,
  contacts,
}) {
  if (["failed", "cancelled"].includes(campaignStatus)) return true;
  if (transportOnly && campaignStatus === "completed") return true;
  if (!Array.isArray(contacts) || contacts.length === 0) return false;
  return contacts.every((item) =>
    ["delivered", "read", "failed"].includes(item?.status),
  );
}
