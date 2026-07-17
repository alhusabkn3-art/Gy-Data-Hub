export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  status: 'active' | 'suspended' | 'pending';
  kycStatus: 'verified' | 'pending' | 'failed' | 'unverified';
  joinedDate: string;
  transactionCount: number;
  totalSpent: number;
  referralCode: string;
  bankName: string;
  accountNumber: string;
}

export interface AdminTransaction {
  id: string;
  userId: string;
  userName: string;
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  service: string;
  provider: string;
  amount: number;
  date: string;
  time: string;
  status: 'success' | 'pending' | 'failed';
  description: string;
  reference: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target: 'all' | 'verified' | 'unverified';
  status: 'sent' | 'draft' | 'scheduled';
  sentAt: string;
  recipients: number;
}

export const adminCredentials = {
  email: 'admin@gydata.com',
  pin: '125125',
};

export const adminMockUsers: AdminUser[] = [
  { id: 'USR-001', name: 'Emeka Johnson', email: 'emeka.johnson@gmail.com', phone: '+234 803 456 7890', balance: 45250, status: 'active', kycStatus: 'verified', joinedDate: 'Jan 12, 2024', transactionCount: 47, totalSpent: 58300, referralCode: 'GY-EMEKA123', bankName: 'GTBank', accountNumber: '1234567890' },
  { id: 'USR-002', name: 'Aisha Bello', email: 'aisha.bello@yahoo.com', phone: '+234 806 234 5678', balance: 12800, status: 'active', kycStatus: 'verified', joinedDate: 'Feb 3, 2024', transactionCount: 29, totalSpent: 24500, referralCode: 'GY-AISHA456', bankName: 'Access Bank', accountNumber: '2345678901' },
  { id: 'USR-003', name: 'Chukwuemeka Obi', email: 'chukwu.obi@gmail.com', phone: '+234 812 345 6789', balance: 3500, status: 'active', kycStatus: 'pending', joinedDate: 'Mar 15, 2024', transactionCount: 11, totalSpent: 8700, referralCode: 'GY-CHUKWU789', bankName: 'UBA', accountNumber: '3456789012' },
  { id: 'USR-004', name: 'Fatima Yusuf', email: 'fatima.yusuf@hotmail.com', phone: '+234 817 456 7890', balance: 67000, status: 'active', kycStatus: 'verified', joinedDate: 'Jan 28, 2024', transactionCount: 93, totalSpent: 145200, referralCode: 'GY-FATIMA012', bankName: 'First Bank', accountNumber: '4567890123' },
  { id: 'USR-005', name: 'Oluwaseun Adeyemi', email: 'seun.adeyemi@gmail.com', phone: '+234 809 567 8901', balance: 0, status: 'suspended', kycStatus: 'failed', joinedDate: 'Apr 2, 2024', transactionCount: 5, totalSpent: 1200, referralCode: 'GY-SEUN345', bankName: 'Zenith Bank', accountNumber: '5678901234' },
  { id: 'USR-006', name: 'Ngozi Okafor', email: 'ngozi.okafor@gmail.com', phone: '+234 805 678 9012', balance: 22100, status: 'active', kycStatus: 'verified', joinedDate: 'Feb 19, 2024', transactionCount: 38, totalSpent: 61400, referralCode: 'GY-NGOZI678', bankName: 'GTBank', accountNumber: '6789012345' },
  { id: 'USR-007', name: 'Babajide Omotosho', email: 'baba.omotosho@yahoo.com', phone: '+234 814 789 0123', balance: 5600, status: 'active', kycStatus: 'unverified', joinedDate: 'May 7, 2024', transactionCount: 4, totalSpent: 3200, referralCode: 'GY-BABA901', bankName: 'Kuda Bank', accountNumber: '7890123456' },
  { id: 'USR-008', name: 'Chidinma Eze', email: 'chidinma.eze@gmail.com', phone: '+234 803 890 1234', balance: 31500, status: 'active', kycStatus: 'verified', joinedDate: 'Mar 3, 2024', transactionCount: 55, totalSpent: 89700, referralCode: 'GY-CHIDI234', bankName: 'Polaris Bank', accountNumber: '8901234567' },
  { id: 'USR-009', name: 'Ibrahim Musa', email: 'ibrahim.musa@gmail.com', phone: '+234 811 901 2345', balance: 8900, status: 'active', kycStatus: 'verified', joinedDate: 'Jan 5, 2024', transactionCount: 22, totalSpent: 28600, referralCode: 'GY-IBRAHIM567', bankName: 'Fidelity Bank', accountNumber: '9012345678' },
  { id: 'USR-010', name: 'Adaeze Nwosu', email: 'adaeze.nwosu@hotmail.com', phone: '+234 808 012 3456', balance: 14300, status: 'pending', kycStatus: 'pending', joinedDate: 'May 20, 2024', transactionCount: 3, totalSpent: 1800, referralCode: 'GY-ADAEZE890', bankName: 'FCMB', accountNumber: '0123456789' },
  { id: 'USR-011', name: 'Tunde Bakare', email: 'tunde.bakare@gmail.com', phone: '+234 816 123 4567', balance: 55000, status: 'active', kycStatus: 'verified', joinedDate: 'Feb 10, 2024', transactionCount: 71, totalSpent: 112500, referralCode: 'GY-TUNDE123', bankName: 'Access Bank', accountNumber: '1123456789' },
  { id: 'USR-012', name: 'Blessing Amadi', email: 'blessing.amadi@yahoo.com', phone: '+234 813 234 5678', balance: 9200, status: 'active', kycStatus: 'verified', joinedDate: 'Apr 14, 2024', transactionCount: 16, totalSpent: 15400, referralCode: 'GY-BLESSING456', bankName: 'UBA', accountNumber: '2234567890' },
  { id: 'USR-013', name: 'Uche Nwachukwu', email: 'uche.nwachukwu@gmail.com', phone: '+234 810 345 6789', balance: 1100, status: 'suspended', kycStatus: 'unverified', joinedDate: 'Mar 28, 2024', transactionCount: 2, totalSpent: 500, referralCode: 'GY-UCHE789', bankName: 'GTBank', accountNumber: '3345678901' },
  { id: 'USR-014', name: 'Hadiza Abdullahi', email: 'hadiza.abdullahi@gmail.com', phone: '+234 807 456 7890', balance: 78400, status: 'active', kycStatus: 'verified', joinedDate: 'Jan 18, 2024', transactionCount: 108, totalSpent: 198600, referralCode: 'GY-HADIZA012', bankName: 'Zenith Bank', accountNumber: '4456789012' },
  { id: 'USR-015', name: 'Onyekachi Ugwu', email: 'onye.ugwu@hotmail.com', phone: '+234 815 567 8901', balance: 17800, status: 'active', kycStatus: 'verified', joinedDate: 'Feb 25, 2024', transactionCount: 34, totalSpent: 42300, referralCode: 'GY-ONYE345', bankName: 'First Bank', accountNumber: '5567890123' },
  { id: 'USR-016', name: 'Yetunde Akindele', email: 'yetunde.akindele@gmail.com', phone: '+234 804 678 9012', balance: 6700, status: 'active', kycStatus: 'pending', joinedDate: 'May 1, 2024', transactionCount: 8, totalSpent: 7200, referralCode: 'GY-YETUNDE678', bankName: 'Kuda Bank', accountNumber: '6678901234' },
  { id: 'USR-017', name: 'Emeka Okonkwo', email: 'emeka.okonkwo@yahoo.com', phone: '+234 812 789 0123', balance: 33200, status: 'active', kycStatus: 'verified', joinedDate: 'Jan 30, 2024', transactionCount: 49, totalSpent: 75800, referralCode: 'GY-EMEKAO901', bankName: 'GTBank', accountNumber: '7789012345' },
  { id: 'USR-018', name: 'Rukayat Suleiman', email: 'rukayat.suleiman@gmail.com', phone: '+234 809 890 1234', balance: 4500, status: 'pending', kycStatus: 'unverified', joinedDate: 'Jun 3, 2024', transactionCount: 1, totalSpent: 300, referralCode: 'GY-RUKAYAT234', bankName: 'Access Bank', accountNumber: '8890123456' },
  { id: 'USR-019', name: 'Chibuzor Nwagbara', email: 'chibu.nwagbara@gmail.com', phone: '+234 814 901 2345', balance: 41600, status: 'active', kycStatus: 'verified', joinedDate: 'Mar 9, 2024', transactionCount: 62, totalSpent: 98400, referralCode: 'GY-CHIBU567', bankName: 'UBA', accountNumber: '9901234567' },
  { id: 'USR-020', name: 'Amaka Obi', email: 'amaka.obi@hotmail.com', phone: '+234 806 012 3456', balance: 11200, status: 'active', kycStatus: 'verified', joinedDate: 'Feb 14, 2024', transactionCount: 25, totalSpent: 31500, referralCode: 'GY-AMAKA890', bankName: 'Polaris Bank', accountNumber: '0012345678' },
];

export const adminMockTransactions: AdminTransaction[] = [
  { id: 'TXN-001', userId: 'USR-001', userName: 'Emeka Johnson', type: 'data', service: 'Data', provider: 'MTN', amount: 500, date: 'Jul 17, 2024', time: '10:42 AM', status: 'success', description: 'MTN 2GB Data', reference: 'REF-MT20240717001' },
  { id: 'TXN-002', userId: 'USR-004', userName: 'Fatima Yusuf', type: 'electricity', service: 'Electricity', provider: 'IKEDC', amount: 10000, date: 'Jul 17, 2024', time: '09:30 AM', status: 'success', description: 'IKEDC Prepaid Token', reference: 'REF-IK20240717002' },
  { id: 'TXN-003', userId: 'USR-002', userName: 'Aisha Bello', type: 'airtime', service: 'Airtime', provider: 'Airtel', amount: 1000, date: 'Jul 17, 2024', time: '08:15 AM', status: 'success', description: 'Airtel Airtime', reference: 'REF-AT20240717003' },
  { id: 'TXN-004', userId: 'USR-011', userName: 'Tunde Bakare', type: 'cable', service: 'Cable TV', provider: 'DSTV', amount: 7900, date: 'Jul 16, 2024', time: '07:00 PM', status: 'success', description: 'DSTV Premium', reference: 'REF-DS20240716004' },
  { id: 'TXN-005', userId: 'USR-006', userName: 'Ngozi Okafor', type: 'data', service: 'Data', provider: 'Glo', amount: 2000, date: 'Jul 16, 2024', time: '04:45 PM', status: 'pending', description: 'Glo 10GB Data', reference: 'REF-GL20240716005' },
  { id: 'TXN-006', userId: 'USR-014', userName: 'Hadiza Abdullahi', type: 'wallet_fund', service: 'Wallet Funding', provider: 'GTBank', amount: 50000, date: 'Jul 16, 2024', time: '02:20 PM', status: 'success', description: 'Transfer from GTBank', reference: 'REF-WF20240716006' },
  { id: 'TXN-007', userId: 'USR-008', userName: 'Chidinma Eze', type: 'exam', service: 'JAMB PIN', provider: 'JAMB', amount: 3500, date: 'Jul 16, 2024', time: '11:10 AM', status: 'success', description: 'JAMB e-PIN Registration', reference: 'REF-JM20240716007' },
  { id: 'TXN-008', userId: 'USR-017', userName: 'Emeka Okonkwo', type: 'data', service: 'Data', provider: 'MTN', amount: 1500, date: 'Jul 16, 2024', time: '09:05 AM', status: 'failed', description: 'MTN 5GB Data', reference: 'REF-MT20240716008' },
  { id: 'TXN-009', userId: 'USR-019', userName: 'Chibuzor Nwagbara', type: 'airtime', service: 'Airtime', provider: '9mobile', amount: 500, date: 'Jul 15, 2024', time: '08:30 PM', status: 'success', description: '9mobile Airtime', reference: 'REF-9M20240715009' },
  { id: 'TXN-010', userId: 'USR-001', userName: 'Emeka Johnson', type: 'cable', service: 'Cable TV', provider: 'Showmax', amount: 2900, date: 'Jul 15, 2024', time: '06:15 PM', status: 'success', description: 'Showmax Mobile', reference: 'REF-SM20240715010' },
  { id: 'TXN-011', userId: 'USR-015', userName: 'Onyekachi Ugwu', type: 'electricity', service: 'Electricity', provider: 'EKEDC', amount: 5000, date: 'Jul 15, 2024', time: '03:45 PM', status: 'success', description: 'EKEDC Prepaid', reference: 'REF-EK20240715011' },
  { id: 'TXN-012', userId: 'USR-009', userName: 'Ibrahim Musa', type: 'wallet_fund', service: 'Wallet Funding', provider: 'Access Bank', amount: 20000, date: 'Jul 15, 2024', time: '01:00 PM', status: 'success', description: 'Transfer from Access Bank', reference: 'REF-WF20240715012' },
  { id: 'TXN-013', userId: 'USR-004', userName: 'Fatima Yusuf', type: 'betting', service: 'Betting', provider: 'Sportybet', amount: 3000, date: 'Jul 15, 2024', time: '11:30 AM', status: 'pending', description: 'Sportybet Wallet Fund', reference: 'REF-SP20240715013' },
  { id: 'TXN-014', userId: 'USR-020', userName: 'Amaka Obi', type: 'data', service: 'Data', provider: 'Airtel', amount: 1000, date: 'Jul 14, 2024', time: '09:00 PM', status: 'success', description: 'Airtel 3GB Data', reference: 'REF-AT20240714014' },
  { id: 'TXN-015', userId: 'USR-011', userName: 'Tunde Bakare', type: 'exam', service: 'WAEC PIN', provider: 'WAEC', amount: 5200, date: 'Jul 14, 2024', time: '07:20 PM', status: 'success', description: 'WAEC Result Checker', reference: 'REF-WC20240714015' },
  { id: 'TXN-016', userId: 'USR-003', userName: 'Chukwuemeka Obi', type: 'airtime', service: 'Airtime', provider: 'MTN', amount: 200, date: 'Jul 14, 2024', time: '04:55 PM', status: 'failed', description: 'MTN Airtime', reference: 'REF-MT20240714016' },
  { id: 'TXN-017', userId: 'USR-014', userName: 'Hadiza Abdullahi', type: 'data', service: 'Data', provider: 'MTN', amount: 5000, date: 'Jul 14, 2024', time: '02:30 PM', status: 'success', description: 'MTN 20GB Data', reference: 'REF-MT20240714017' },
  { id: 'TXN-018', userId: 'USR-006', userName: 'Ngozi Okafor', type: 'wallet_fund', service: 'Wallet Funding', provider: 'UBA', amount: 30000, date: 'Jul 14, 2024', time: '12:00 PM', status: 'success', description: 'Transfer from UBA', reference: 'REF-WF20240714018' },
  { id: 'TXN-019', userId: 'USR-008', userName: 'Chidinma Eze', type: 'electricity', service: 'Electricity', provider: 'PHED', amount: 8000, date: 'Jul 13, 2024', time: '10:45 AM', status: 'success', description: 'PHED Prepaid', reference: 'REF-PH20240713019' },
  { id: 'TXN-020', userId: 'USR-019', userName: 'Chibuzor Nwagbara', type: 'cable', service: 'Cable TV', provider: 'GOtv', amount: 2250, date: 'Jul 13, 2024', time: '08:15 AM', status: 'success', description: 'GOtv Max', reference: 'REF-GT20240713020' },
  { id: 'TXN-021', userId: 'USR-001', userName: 'Emeka Johnson', type: 'airtime', service: 'Airtime', provider: 'Airtel', amount: 1000, date: 'Jul 13, 2024', time: '06:30 PM', status: 'success', description: 'Airtel Airtime', reference: 'REF-AT20240713021' },
  { id: 'TXN-022', userId: 'USR-017', userName: 'Emeka Okonkwo', type: 'data', service: 'Data', provider: 'Glo', amount: 500, date: 'Jul 12, 2024', time: '05:00 PM', status: 'success', description: 'Glo 1.5GB Data', reference: 'REF-GL20240712022' },
  { id: 'TXN-023', userId: 'USR-012', userName: 'Blessing Amadi', type: 'wallet_fund', service: 'Wallet Funding', provider: 'First Bank', amount: 15000, date: 'Jul 12, 2024', time: '03:10 PM', status: 'success', description: 'Transfer from First Bank', reference: 'REF-WF20240712023' },
  { id: 'TXN-024', userId: 'USR-002', userName: 'Aisha Bello', type: 'betting', service: 'Betting', provider: 'BetKing', amount: 2000, date: 'Jul 12, 2024', time: '01:45 PM', status: 'pending', description: 'BetKing Wallet Fund', reference: 'REF-BK20240712024' },
  { id: 'TXN-025', userId: 'USR-015', userName: 'Onyekachi Ugwu', type: 'data', service: 'Data', provider: '9mobile', amount: 300, date: 'Jul 11, 2024', time: '12:30 PM', status: 'success', description: '9mobile 1GB Data', reference: 'REF-9M20240711025' },
];

export const adminStats = {
  totalUsers: 1247,
  activeUsers: 1089,
  suspendedUsers: 43,
  pendingKYC: 115,
  totalTransactions: 4832,
  successfulTransactions: 4511,
  pendingTransactions: 218,
  failedTransactions: 103,
  totalRevenue: 18427600,
  todayRevenue: 247300,
  weekRevenue: 1842700,
  monthRevenue: 7391000,
  totalWalletBalance: 28450000,
  avgTransactionValue: 3812,
};

export const serviceStats = [
  { name: 'Data', icon: '📶', transactions: 2144, revenue: 6280000, successRate: 96.2, color: '#3B82F6' },
  { name: 'Airtime', icon: '📞', transactions: 1388, revenue: 3920000, successRate: 98.7, color: '#10B981' },
  { name: 'Electricity', icon: '⚡', transactions: 621, revenue: 4830000, successRate: 94.8, color: '#F59E0B' },
  { name: 'Cable TV', icon: '📺', transactions: 298, revenue: 2240000, successRate: 97.3, color: '#8B5CF6' },
  { name: 'Betting', icon: '🎯', transactions: 187, revenue: 820000, successRate: 91.4, color: '#EF4444' },
  { name: 'Exam Pins', icon: '📝', transactions: 194, revenue: 337600, successRate: 99.5, color: '#14B8A6' },
];

export const revenueChart = [
  { day: 'Mon', amount: 248000 },
  { day: 'Tue', amount: 312000 },
  { day: 'Wed', amount: 198000 },
  { day: 'Thu', amount: 421000 },
  { day: 'Fri', amount: 387000 },
  { day: 'Sat', amount: 529000 },
  { day: 'Sun', amount: 247300 },
];

export const adminAnnouncements: Announcement[] = [
  { id: 'ANN-001', title: '🎉 Weekend Data Bonus', body: 'Get 2x data bonus on all MTN purchases this weekend! Offer valid Friday–Sunday.', target: 'all', status: 'sent', sentAt: 'Jul 12, 2024 09:00 AM', recipients: 1089 },
  { id: 'ANN-002', title: '🔐 Complete Your KYC', body: 'Verify your identity to unlock higher transaction limits and exclusive offers.', target: 'unverified', status: 'sent', sentAt: 'Jul 10, 2024 11:00 AM', recipients: 115 },
  { id: 'ANN-003', title: '⚡ New Service: Electricity Bills', body: 'Pay your electricity bills seamlessly on GY DATA. Supports EKEDC, IKEDC, PHED, and more.', target: 'all', status: 'sent', sentAt: 'Jul 5, 2024 08:00 AM', recipients: 1089 },
  { id: 'ANN-004', title: '🎓 Back to School — Exam Pins', body: 'JAMB, WAEC, and NECO result checker pins now available. Get yours now!', target: 'all', status: 'sent', sentAt: 'Jun 28, 2024 10:00 AM', recipients: 1089 },
  { id: 'ANN-005', title: '📱 Referral Bonus Update', body: 'Earn ₦500 for every verified user you refer. No limit on earnings!', target: 'verified', status: 'draft', sentAt: '—', recipients: 0 },
];
