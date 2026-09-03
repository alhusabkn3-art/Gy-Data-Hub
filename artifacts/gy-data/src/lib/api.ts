/**
 * Fetch manually configured SMEDATA plans.
 *
 * Phone number is NOT needed here.
 * Phone is only sent during the actual purchase.
 */
export async function fetchDataPlans(
  network: string,
): Promise<DataPlan[]> {
  const data =
    await apiFetch<{
      success: boolean;
      plans: DataPlan[];
    }>(
      `/data-plans?network=${encodeURIComponent(
        network,
      )}`,
    );

  return data.plans ?? [];
}
