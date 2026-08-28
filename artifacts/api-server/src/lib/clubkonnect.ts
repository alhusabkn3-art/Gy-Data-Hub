// ─────────────────────────────────────────────────────────────────────────────
// DATA PURCHASE
// ─────────────────────────────────────────────────────────────────────────────

export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);

  // Always normalize the recipient number on the SERVER.
  // Nigerian local format: 08012345678 -> 08012345678
  // International format: 2348012345678 -> 2348012345678
  const mobileNumber = String(params.phone ?? '')
    .trim()
    .replace(/\D/g, '');

  if (!mobileNumber) {
    throw new Error(
      'ClubKonnect purchase aborted: MobileNumber is empty.',
    );
  }

  if (mobileNumber.length < 10 || mobileNumber.length > 13) {
    throw new Error(
      `ClubKonnect purchase aborted: invalid MobileNumber length (${mobileNumber.length}).`,
    );
  }

  const dataPlan = String(params.planCode ?? '').trim();

  if (!dataPlan) {
    throw new Error(
      'ClubKonnect purchase aborted: DataPlan is empty.',
    );
  }

  const requestId = String(params.requestId ?? '').trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect purchase aborted: RequestID is empty.',
    );
  }

  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork: networkCode,
      DataPlan: dataPlan,
      MobileNumber: mobileNumber,
      RequestID: requestId,
    },
  );

  // Safe diagnostic logging.
  // NEVER log UserID, APIKey, or the complete URL.
  logger.info(
    {
      endpoint: 'APIDatabundleV1.asp',
      network: params.network,
      networkCode,
      planCode: dataPlan,
      phonePresent: true,
      phoneLength: mobileNumber.length,
      requestId,
    },
    'ClubKonnect data purchase request prepared',
  );

  let response: Response;

  try {
    response = await fetchTimeout(
      url,
      TIMEOUT_PURCHASE,
    );
  } catch (error) {
    logger.error(
      {
        endpoint: 'APIDatabundleV1.asp',
        network: params.network,
        networkCode,
        planCode: dataPlan,
        phonePresent: Boolean(mobileNumber),
        phoneLength: mobileNumber.length,
        requestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      'ClubKonnect data purchase request failed',
    );

    throw new Error(
      'Unable to connect to ClubKonnect while purchasing data.',
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(
      {
        endpoint: 'APIDatabundleV1.asp',
        httpStatus: response.status,
        network: params.network,
        networkCode,
        planCode: dataPlan,
        phonePresent: Boolean(mobileNumber),
        phoneLength: mobileNumber.length,
        requestId,
        responsePreview: responseText.slice(0, 1000),
      },
      'ClubKonnect data purchase HTTP error',
    );

    throw new Error(
      `ClubKonnect data purchase HTTP ${response.status}`,
    );
  }

  if (!responseText.trim()) {
    logger.error(
      {
        endpoint: 'APIDatabundleV1.asp',
        network: params.network,
        networkCode,
        planCode: dataPlan,
        phonePresent: Boolean(mobileNumber),
        phoneLength: mobileNumber.length,
        requestId,
      },
      'ClubKonnect returned an empty purchase response',
    );

    throw new Error(
      'ClubKonnect returned an empty purchase response.',
    );
  }

  let result: CKPurchaseResult;

  try {
    result = JSON.parse(
      responseText,
    ) as CKPurchaseResult;
  } catch {
    logger.error(
      {
        endpoint: 'APIDatabundleV1.asp',
        network: params.network,
        networkCode,
        planCode: dataPlan,
        phonePresent: Boolean(mobileNumber),
        phoneLength: mobileNumber.length,
        requestId,
        responsePreview: responseText.slice(0, 2000),
      },
      'ClubKonnect returned invalid JSON',
    );

    throw new Error(
      'ClubKonnect returned an invalid purchase response.',
    );
  }

  logger.info(
    {
      endpoint: 'APIDatabundleV1.asp',
      network: params.network,
      networkCode,
      planCode: dataPlan,
      phonePresent: Boolean(mobileNumber),
      phoneLength: mobileNumber.length,
      requestId,
      vendorStatus: result.status,
      providerRef:
        result.OrderID ??
        result.ident ??
        null,
    },
    'ClubKonnect data purchase response',
  );

  return result;
}
