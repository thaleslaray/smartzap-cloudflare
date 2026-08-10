export type PricingAnalyticsPoint = {
  start: number;
  end: number;
  phoneNumber?: string | null;
  country?: string | null;
  tier?: string | null;
  pricingType?: string | null;
  pricingCategory?: string | null;
  volume?: number | null;
  cost?: number | null;
};

export async function fetchPricingAnalytics(input: {
  token: string;
  version: string;
  wabaId: string;
  start: number;
  end: number;
  granularity?: "DAILY" | "HALF_HOUR" | "MONTHLY";
  phoneNumbers?: string[];
  countryCodes?: string[];
}): Promise<{ currency: string | null; points: PricingAnalyticsPoint[]; raw: unknown }> {
  if (!/^v\d+\.\d+$/.test(input.version)) throw new Error("versão Graph inválida");
  if (!/^\d{5,32}$/.test(input.wabaId)) throw new Error("WABA inválida");
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end) || input.end <= input.start)
    throw new Error("intervalo de analytics inválido");
  if (input.end - input.start > 93 * 86_400)
    throw new Error("intervalo de analytics excede 93 dias");
  const calls = [
    `.start(${input.start})`,
    `.end(${input.end})`,
    `.granularity(${input.granularity ?? "DAILY"})`,
    `.metric_types(COST,VOLUME)`,
    `.dimensions(PRICING_CATEGORY,PRICING_TYPE,TIER,COUNTRY,PHONE)`,
    ...(input.phoneNumbers?.length ? [`.phone_numbers(${input.phoneNumbers.join(",")})`] : []),
    ...(input.countryCodes?.length ? [`.country_codes(${input.countryCodes.join(",")})`] : []),
  ].join("");
  const fields = `currency,pricing_analytics${calls}`;
  const response = await fetch(
    `https://graph.facebook.com/${input.version}/${input.wabaId}?fields=${encodeURIComponent(fields)}`,
    {
      headers: { authorization: `Bearer ${input.token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || data.error) {
    const error = data.error && typeof data.error === "object"
      ? data.error as Record<string, unknown>
      : data;
    const graph = new Error("A Meta não retornou pricing analytics") as Error & { code?: number; status?: number };
    graph.code = typeof error.code === "number" ? error.code : undefined;
    graph.status = response.status;
    throw graph;
  }
  const analytics = data.pricing_analytics && typeof data.pricing_analytics === "object"
    ? data.pricing_analytics as Record<string, unknown>
    : {};
  const groups = Array.isArray(analytics.data) ? analytics.data : [];
  const points: PricingAnalyticsPoint[] = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const rows = Array.isArray((group as Record<string, unknown>).data_points)
      ? (group as Record<string, unknown>).data_points as unknown[]
      : [];
    for (const candidate of rows) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      const start = Number(row.start);
      const end = Number(row.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      points.push({
        start,
        end,
        phoneNumber: typeof row.phone_number === "string" ? row.phone_number : null,
        country: typeof row.country === "string" ? row.country : null,
        tier: typeof row.tier === "string" ? row.tier : null,
        pricingType: typeof row.pricing_type === "string" ? row.pricing_type : null,
        pricingCategory: typeof row.pricing_category === "string" ? row.pricing_category : null,
        volume: typeof row.volume === "number" ? row.volume : null,
        cost: typeof row.cost === "number" ? row.cost : null,
      });
    }
  }
  return {
    currency: typeof data.currency === "string" ? data.currency : null,
    points,
    raw: analytics,
  };
}
