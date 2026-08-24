export async function getDataPlans(
  network: string,
  phone?: string,
): Promise<CKDataPlan[]> {
  const normalizedNetwork = network.trim().toLowerCase();

  const networkCode = getNetworkCode(normalizedNetwork);

  const normalizedPhone =
    typeof phone === 'string'
      ? phone.replace(/\D/g, '').trim()
      : '';

  if (!normalizedPhone) {
    logger.warn(
      {
        network: normalizedNetwork,
        networkCode,
      },
      'Cannot fetch ClubKonnect data plans without phone number',
    );

    return [];
  }

  /*
   * IMPORTANT:
   * ClubKonnect is returning:
   * {"status":"MISSING_PHONE_NUMBER"}
   *
   * Therefore MobileNumber MUST be sent to the
   * data-plan endpoint.
   */
  const url = buildUrl(
    'APIDatabundlePlansV1.asp',
    {
      MobileNetwork: networkCode,
      MobileNumber: normalizedPhone,
    },
  );

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      hasPhone: true,
      endpoint: 'APIDatabundlePlansV1.asp',
    },
    'Fetching ClubKonnect data plans',
  );

  let response: Response;

  try {
    response = await fetchTimeout(
      url,
      TIMEOUT_READ,
    );
  } catch (error) {
    logger.error(
      {
        network: normalizedNetwork,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data plan request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while fetching data plans.',
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(
      {
        network: normalizedNetwork,
        httpStatus: response.status,
        responsePreview: responseText.slice(0, 2000),
      },
      'ClubKonnect data plans HTTP error',
    );

    throw new Error(
      `ClubKonnect data plans HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    logger.warn(
      {
        network: normalizedNetwork,
      },
      'ClubKonnect returned an empty data plans response',
    );

    return [];
  }

  let json: unknown;

  try {
    json = JSON.parse(responseText);
  } catch {
    logger.error(
      {
        network: normalizedNetwork,
        responsePreview: responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid response while fetching data plans.',
    );
  }

  const root = asObject(json);

  if (!root) {
    logger.warn(
      {
        network: normalizedNetwork,
        responseType: typeof json,
        responsePreview: JSON.stringify(json).slice(0, 2000),
      },
      'ClubKonnect data plans response is not an object',
    );

    return [];
  }

  /*
   * The provider may return plans directly, or grouped
   * under network/data/product containers.
   */
  const rawProducts: Record<string, unknown>[] = [];

  collectProductObjects(
    root,
    rawProducts,
  );

  logger.info(
    {
      network: normalizedNetwork,
      networkCode,
      rootKeys: Object.keys(root),
      rawProductCount: rawProducts.length,
    },
    'ClubKonnect response parsed',
  );

  if (rawProducts.length === 0) {
    logger.warn(
      {
        network: normalizedNetwork,
        networkCode,
        rootKeys: Object.keys(root),
        responsePreview: JSON.stringify(root).slice(0, 4000),
      },
      'No ClubKonnect data plans found in provider response',
    );

    return [];
  }

  const plans: CKDataPlan[] = [];

  for (const product of rawProducts) {
    const plan = formatPlan(product);

    if (plan) {
      plans.push(plan);
    }
  }

  const uniquePlans = Array.from(
    new Map(
      plans.map((plan) => [
        plan.DataPlan,
        plan,
      ]),
    ).values(),
  );

  logger.info(
    {
      network: normalizedNetwork,
      count: uniquePlans.length,
    },
    'ClubKonnect data plans loaded',
  );

  return uniquePlans;
}
