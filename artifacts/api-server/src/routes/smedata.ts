import axios from 'axios';

const BASE_URL = 'https://smedata.ng/wp-json/api/v1';

function getToken(): string {
  const token = process.env.SMEDATA_API_TOKEN?.trim();

  if (!token) {
    throw new Error('SMEDATA_API_TOKEN is not configured');
  }

  return token;
}

function normalizePhone(phone: string): string {
  let value = String(phone ?? '').replace(/\D/g, '');

  if (value.startsWith('234')) {
    value = `0${value.slice(3)}`;
  }

  if (!/^0\d{10}$/.test(value)) {
    throw new Error('Invalid Nigerian phone number');
  }

  return value;
}

function normalizeNetwork(network: string): string {
  const value = String(network ?? '').trim().toLowerCase();

  const networks: Record<string, string> = {
    mtn: 'mtn',
    glo: 'glo',
    airtel: 'airtel',
  };

  const result = networks[value];

  if (!result) {
    throw new Error(`SMEDATA does not support network: ${network}`);
  }

  return result;
}

function normalizeSize(size: string): string {
  return String(size ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export interface SmedataPurchaseParams {
  network: string;
  phone: string;
  size: string;
}

export interface SmedataPurchaseResult {
  success: boolean;
  status: 'success' | 'processing' | 'failure';
  message: string;
  providerRef: string | null;
  raw: unknown;
}

export async function purchaseSmedataData(
  params: SmedataPurchaseParams,
): Promise<SmedataPurchaseResult> {
  const token = getToken();
  const phone = normalizePhone(params.phone);
  const network = normalizeNetwork(params.network);
  const size = normalizeSize(params.size);

  if (!size) {
    throw new Error('Data plan size is required');
  }

  const response = await axios.get(`${BASE_URL}/data`, {
    params: {
      token,
      phone,
      network,
      size,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  const data = response.data;

  const code = String(data?.code ?? '').toLowerCase();
  const message = String(data?.message ?? 'Unknown SMEDATA response');

  const providerRef =
    data?.data?.order_id !== undefined && data?.data?.order_id !== null
      ? String(data.data.order_id)
      : null;

  if (code === 'success') {
    return {
      success: true,
      status: 'success',
      message,
      providerRef,
      raw: data,
    };
  }

  if (
    code === 'processing' ||
    message.toLowerCase().includes('processing')
  ) {
    return {
      success: false,
      status: 'processing',
      message,
      providerRef,
      raw: data,
    };
  }

  return {
    success: false,
    status: 'failure',
    message,
    providerRef,
    raw: data,
  };
}

export async function requerySmedataData(
  orderId: string,
): Promise<SmedataPurchaseResult> {
  const token = getToken();

  const cleanOrderId = String(orderId ?? '').trim();

  if (!cleanOrderId) {
    throw new Error('SMEDATA order ID is required');
  }

  const response = await axios.get(`${BASE_URL}/requery`, {
    params: {
      token,
      orderid: cleanOrderId,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  const data = response.data;

  const code = String(data?.code ?? '').toLowerCase();
  const message = String(data?.message ?? 'Unknown SMEDATA response');

  const providerRef =
    data?.data?.order_id !== undefined && data?.data?.order_id !== null
      ? String(data.data.order_id)
      : cleanOrderId;

  if (code === 'success') {
    return {
      success: true,
      status: 'success',
      message,
      providerRef,
      raw: data,
    };
  }

  if (
    code === 'processing' ||
    message.toLowerCase().includes('processing')
  ) {
    return {
      success: false,
      status: 'processing',
      message,
      providerRef,
      raw: data,
    };
  }

  return {
    success: false,
    status: 'failure',
    message,
    providerRef,
    raw: data,
  };
}

export function isSmedataConfigured(): boolean {
  return Boolean(process.env.SMEDATA_API_TOKEN?.trim());
}
