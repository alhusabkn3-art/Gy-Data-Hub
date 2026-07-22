import React, { useState, useEffect } from 'react';
import { Search, UserCheck, UserX, Eye, X, Phone, Mail, CreditCard, Calendar, ShoppingBag, RefreshCw } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { AdminUser } from '../data/adminMockData';
import { toast } from 'sonner';

type FilterStatus = 'all' | 'active' | 'suspended' | 'pending';
type FilterKYC    = 'all' | 'verified' | 'pending' | 'unverified' | 'failed';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

export default function AdminUsers() {
  const { users, usersTotal, usersLoading, updateUserStatus, fetchUsers } = useAdminContext();
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterKYC,    setFilterKYC]    = useState<FilterKYC>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Client-side filter on the loaded batch
  const filtered = users.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.phone.includes(search) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    const matchKYC    = filterKYC    === 'all' || u.kycStatus === filterKYC;
    return matchSearch && matchStatus && matchKYC;
  });

  const handleSuspend = async (u: AdminUser) => {
    const ok = await updateUserStatus(u.id, 'suspended');
    if (ok) { toast.success(`${u.name} has been suspended.`); setSelectedUser(null); }
    else     toast.error('Failed to suspend user. Please try again.');
  };

  const handleActivate = async (u: AdminUser) => {
    const ok = await updateUserStatus(u.id, 'active');
    if (ok) { toast.success(`${u.name} has been activated.`); setSelectedUser(null); }
    else     toast.error('Failed to activate user. Please try again.');
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {usersLoading ? 'Loading…' : `${usersTotal.toLocaleString()} registered users`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 text-xs">
            {usersLoading ? (
              <Skeleton className="h-7 w-20 rounded-xl" />
            ) : (
              <>
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-xl font-semibold">
                  {users.filter(u => u.status === 'active').length} Active
                </div>
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-xl font-semibold">
                  {users.filter(u => u.status === 'suspended').length} Suspended
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => fetchUsers()}
            disabled={usersLoading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, phone or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl h-10 pl-9 pr-4 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
        <select
          value={filterKYC}
          onChange={e => setFilterKYC(e.target.value as FilterKYC)}
          className="bg-card border border-border rounded-xl h-10 px-3 text-sm outline-none focus:border-primary transition-colors"
        >
          <option value="all">All KYC</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="unverified">Unverified</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Balance</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">KYC</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && users.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                        <div>
                          <Skeleton className="h-4 w-28 mb-1" />
                          <Skeleton className="h-3 w-36" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-5 w-14 mx-auto rounded-full" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-6 w-12 mx-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-muted-foreground text-sm">
                    {users.length === 0
                      ? 'No registered users yet.'
                      : 'No users match your filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map(u => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 border border-primary/20">
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{u.phone}</td>
                    <td className="px-4 py-3 text-right font-semibold hidden sm:table-cell">
                      ₦{u.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={u.kycStatus} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors border border-primary/20"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing {filtered.length} of {usersTotal.toLocaleString()} users</span>
            {usersTotal > users.length && (
              <span className="text-amber-400">Showing first {users.length} — use filters to narrow down</span>
            )}
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={() => setSelectedUser(null)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-5 max-w-md mx-auto shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary border border-primary/20">
                  {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h2 className="font-bold">{selectedUser.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedUser.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <DetailRow icon={Mail}        label="Email"        value={selectedUser.email} />
              <DetailRow icon={Phone}       label="Phone"        value={selectedUser.phone} />
              <DetailRow icon={CreditCard}  label="Bank"         value={`${selectedUser.bankName} · ${selectedUser.accountNumber}`} />
              <DetailRow icon={Calendar}    label="Joined"       value={selectedUser.joinedDate} />
              <DetailRow icon={ShoppingBag} label="Transactions" value={`${selectedUser.transactionCount} txns · ₦${selectedUser.totalSpent.toLocaleString()} spent`} />

              <div className="flex gap-3 pt-2">
                <div className="flex-1 bg-background rounded-xl p-3 text-center border border-border">
                  <p className="text-lg font-bold">₦{selectedUser.balance.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Wallet Balance</p>
                </div>
                <div className="flex-1 bg-background rounded-xl p-3 text-center border border-border">
                  <div className="flex justify-center mb-1">
                    <StatusBadge status={selectedUser.kycStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">KYC Status</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {selectedUser.status === 'active' ? (
                  <button
                    onClick={() => handleSuspend(selectedUser)}
                    className="flex-1 h-10 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-red-500/20 transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" /> Suspend User
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivate(selectedUser)}
                    className="flex-1 h-10 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-green-500/20 transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Activate User
                  </button>
                )}
                <button
                  onClick={() => toast.info('Message user — coming soon')}
                  className="flex-1 h-10 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/20 transition-colors"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50">
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className="font-medium text-sm truncate">{value}</span>
    </div>
  );
}
