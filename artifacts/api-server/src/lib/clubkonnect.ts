export async function purchaseData(
  params: {
    network: string;
    phone: string;
    planCode: string;
    requestId: string;
  },
): Promise<CKPurchaseResult> {
  const networkCode = getNetworkCode(params.network);

  /*
   * Normalize Nigerian phone number.
   *
   * 08012345678
   * +2348012345678
   * 2348012345678
   *
   * become:
   * 08012345678
   */
  const rawPhone = String(params.phone ?? '').trim();

  let mobileNumber = rawPhone.replace(/\D/g, '');

  if (mobileNumber.startsWith('234')) {
    mobileNumber = `0${mobileNumber.slice(3)}`;
  }

  if (!/^0\d{10}$/.test(mobileNumber)) {
    throw new Error(
      `Invalid MobileNumber for ClubKonnect: ${
        rawPhone || '[empty]'
      }`,
    );
  }

  const planCode = String(params.planCode ?? '').trim();

  if (!planCode) {
    throw new Error(
      'ClubKonnect data purchase requires a DataPlan.',
    );
  }

  const requestId = String(params.requestId ?? '').trim();

  if (!requestId) {
    throw new Error(
      'ClubKonnect data purchase requires a RequestID.',
    );
  }

  /*
   * Build the EXACT request that will be sent to ClubKonnect.
   */
  const url = buildUrl(
    'APIDatabundleV1.asp',
    {
      MobileNetwork: networkCode,
      DataPlan: planCode,
      MobileNumber: mobileNumber,
      RequestID: requestId,
    },
  );

  /*
   * FORENSIC DIAGNOSTIC
   *
   * Log the exact outgoing URL, but NEVER expose the API key.
   */
  const diagnosticUrl = new URL(url);

  diagnosticUrl.searchParams.set('APIKey', 'REDACTED');

  logger.info(
    {
      finalRequestUrl: diagnosticUrl.toString(),
      endpoint: 'APIDatabundleV1.asp',
      network: params.network,
      networkCode,
      dataPlan: planCode,
      mobileNumber,
      mobileNumberLength: mobileNumber.length,
      requestId,
      hasMobileNumber:
        diagnosticUrl.searchParams.has('MobileNumber'),
      loggedMobileNumber:
        diagnosticUrl.searchParams.get('MobileNumber'),
    },
    'ClubKonnect FINAL OUTGOING REQUEST',
  );

  /*
   * Send request.
   */
  const response = await fetchTimeout(
    url,
    TIMEOUT_PURCHASE,
  );

  /*
   * FORENSIC DIAGNOSTIC
   *
   * fetch() follows redirects automatically.
   * response.url tells us where the request finally ended.
   */
  const responseUrl = new URL(response.url);

  responseUrl.searchParams.set('APIKey', 'REDACTED');

  logger.info(
    {
      originalRequestUrl: diagnosticUrl.toString(),
      finalResponseUrl: responseUrl.toString(),
      redirected: response.redirected,
      httpStatus: response.status,
      responseUrlContainsMobileNumber:
        responseUrl.searchParams.has('MobileNumber'),
      responseMobileNumber:
        responseUrl.searchParams.get('MobileNumber'),
      mobileNumber,
      mobileNumberLength: mobileNumber.length,
      requestId,
    },
    'ClubKonnect FINAL RESPONSE URL',
  );

  const responseText = await response.text();

  if (!response.ok) {
    logger.error(
      {
        endpoint: 'APIDatabundleV1.asp',
        httpStatus: response.status,
        network: params.network,
        networkCode,
        dataPlan: planCode,
        mobileNumberLength: mobileNumber.length,
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
    throw new Error(
      'ClubKonnect returned an empty data purchase response.',
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
        dataPlan: planCode,
        mobileNumberLength: mobileNumber.length,
        requestId,
        responsePreview: responseText.slice(0, 1000),
      },
      'ClubKonnect returned invalid JSON for data purchase',
    );

    throw new Error(
      'ClubKonnect returned an invalid data purchase response.',
    );
  }

  logger.info(
    {
      endpoint: 'APIDatabundleV1.asp',
      network: params.network,
      networkCode,
      dataPlan: planCode,
      mobileNumber,
      mobileNumberLength: mobileNumber.length,
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
