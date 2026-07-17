export interface Transaction {
  id: string;
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  service: string;
  provider: string;
  amount: number;
  date: string;
  time: string;
  status: 'success' | 'pending' | 'failed';
  description: string;
  paymentMethod?: string;
}

export interface Notification {
  id: string;
  type: 'transaction' | 'promo' | 'system' | 'security';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export const mockUser = {
  name: "Emeka Johnson",
  firstName: "Emeka",
  email: "emeka.johnson@gmail.com",
  phone: "+234 803 456 7890",
  accountNumber: "1234567890",
  bankName: "GTBank",
  balance: 45250.00,
  kycStatus: "verified" as const,
  referralCode: "GY-EMEKA123",
  avatar: null,
};

export const mockTransactions: Transaction[] = [
  { id: 'TXN-101', type: 'data', service: 'Data', provider: 'MTN', amount: 300, date: 'Today', time: '10:42 AM', status: 'success', description: 'MTN 1GB Data', paymentMethod: 'Wallet' },
  { id: 'TXN-102', type: 'airtime', service: 'Airtime', provider: 'Airtel', amount: 500, date: 'Today', time: '09:15 AM', status: 'success', description: 'Airtel Airtime', paymentMethod: 'Wallet' },
  { id: 'TXN-103', type: 'electricity', service: 'Electricity', provider: 'EKEDC', amount: 5000, date: 'Yesterday', time: '04:30 PM', status: 'success', description: 'EKEDC Prepaid', paymentMethod: 'Card' },
  { id: 'TXN-104', type: 'wallet_fund', service: 'Wallet Funding', provider: 'Bank Transfer', amount: 10000, date: 'Yesterday', time: '11:20 AM', status: 'success', description: 'Transfer from GTBank', paymentMethod: 'Bank Transfer' },
  { id: 'TXN-105', type: 'data', service: 'Data', provider: 'Glo', amount: 500, date: '2 days ago', time: '02:10 PM', status: 'failed', description: 'Glo 2GB Data', paymentMethod: 'Wallet' },
  { id: 'TXN-106', type: 'cable', service: 'Cable TV', provider: 'DSTV', amount: 3500, date: '3 days ago', time: '08:45 AM', status: 'success', description: 'DSTV Compact Subscription', paymentMethod: 'Wallet' },
  { id: 'TXN-107', type: 'airtime', service: 'Airtime', provider: 'MTN', amount: 200, date: '3 days ago', time: '07:30 AM', status: 'pending', description: 'MTN Airtime', paymentMethod: 'Wallet' },
  { id: 'TXN-108', type: 'data', service: 'Data', provider: '9mobile', amount: 100, date: '4 days ago', time: '06:15 PM', status: 'success', description: '9mobile 500MB Data', paymentMethod: 'Wallet' },
  { id: 'TXN-109', type: 'exam', service: 'JAMB PIN', provider: 'JAMB', amount: 3500, date: '1 week ago', time: '10:00 AM', status: 'success', description: 'JAMB e-PIN', paymentMethod: 'Wallet' },
  { id: 'TXN-110', type: 'exam', service: 'WAEC PIN', provider: 'WAEC', amount: 5200, date: '2 weeks ago', time: '11:45 AM', status: 'success', description: 'WAEC Result Checker', paymentMethod: 'Card' },
];

export const mockNotifications: Notification[] = [
  { id: 'NOT-1', type: 'transaction', title: 'Transaction Successful', body: 'Your MTN Data purchase of ₦300 was successful.', timestamp: '2 min ago', read: false },
  { id: 'NOT-2', type: 'transaction', title: 'Wallet Funded', body: '₦10,000 has been credited to your GY DATA wallet.', timestamp: '1 hour ago', read: false },
  { id: 'NOT-3', type: 'promo', title: '🎉 Special Offer', body: 'Get 2x data bonus on all MTN purchases this weekend!', timestamp: 'Yesterday', read: true },
  { id: 'NOT-4', type: 'security', title: 'Security Alert', body: 'You logged in from a new device. If this wasn\'t you, change your PIN.', timestamp: '2 days ago', read: true },
  { id: 'NOT-5', type: 'system', title: 'KYC Reminder', body: 'Complete your KYC verification to unlock higher transaction limits.', timestamp: '3 days ago', read: true },
];
