export async function buyData(params: {
  network: string;
  phone: string;
  planCode: string;
  planName: string;
  amount: number;
}): Promise<PurchaseResult> {
  const phone =
    String(params.phone ?? '').trim();

  if (!phone) {
    throw new Error(
      'Phone number is required.',
    );
  }

  const planCode =
    String(params.planCode ?? '').trim();

  if (!planCode) {
    throw new Error(
      'Data plan is required.',
    );
  }

  const network =
    String(params.network ?? '').trim().toLowerCase();

  if (!network) {
    throw new Error(
      'Network is required.',
    );
  }

  const response =
    await apiFetch<PurchaseResult>(
      '/data',
      {
        method: 'POST',
        body: JSON.stringify({
          network,
          phone,
          planCode,
          planName:
            String(
              params.planName ?? '',
            ).trim(),
          planPrice:
            String(
              params.amount ?? '',
            ).trim(),
        }),
      },
    );

  return response;
}
