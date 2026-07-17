import React from 'react';
import { TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { serviceStats } from '../data/adminMockData';

export default function AdminServices() {
  const totalRevenue = serviceStats.reduce((a, b) => a + b.revenue, 0);
  const totalTxns = serviceStats.reduce((a, b) => a + b.transactions, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Services</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Performance overview across all GY DATA services</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{serviceStats.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Active Services</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">₦{(totalRevenue / 1_000_000).toFixed(1)}M</p>
          <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold">{totalTxns.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Transactions</p>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {serviceStats.map(s => {
          const revPct = Math.round((s.revenue / totalRevenue) * 100);
          const txnPct = Math.round((s.transactions / totalTxns) * 100);
          return (
            <div key={s.name} className="bg-card border border-border rounded-2xl p-5 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: s.color + '18', border: `1px solid ${s.color}30` }}
                  >
                    {s.icon}
                  </div>
                  <div>
                    <h3 className="font-bold">{s.name}</h3>
                    <p className="text-xs text-muted-foreground">{s.transactions.toLocaleString()} transactions</p>
                  </div>
                </div>
                <div
                  className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{ color: s.color, backgroundColor: s.color + '15', border: `1px solid ${s.color}25` }}
                >
                  {s.successRate}%
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Revenue</span>
                    <span className="text-xs font-semibold">₦{(s.revenue / 1_000_000).toFixed(2)}M · {revPct}%</span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${revPct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Txn Share</span>
                    <span className="text-xs font-semibold">{txnPct}% of total</span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div className="h-full rounded-full opacity-50" style={{ width: `${txnPct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center bg-green-500/5 border border-green-500/15 rounded-lg p-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Success</p>
                  <p className="text-xs font-bold text-green-400">{s.successRate}%</p>
                </div>
                <div className="text-center bg-amber-500/5 border border-amber-500/15 rounded-lg p-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Pending</p>
                  <p className="text-xs font-bold text-amber-400">{Math.round(s.transactions * 0.04)}</p>
                </div>
                <div className="text-center bg-red-500/5 border border-red-500/15 rounded-lg p-2">
                  <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground">Failed</p>
                  <p className="text-xs font-bold text-red-400">{Math.round(s.transactions * (1 - s.successRate / 100))}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming soon services */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Upcoming Services</h2>
          <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold">In Development</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '🏦', name: 'Bank Transfer', eta: 'Q3 2024' },
            { icon: '🎓', name: 'School Fees', eta: 'Q3 2024' },
            { icon: '✈️', name: 'Flight Booking', eta: 'Q4 2024' },
            { icon: '🏥', name: 'Health Insurance', eta: 'Q4 2024' },
          ].map(s => (
            <div key={s.name} className="bg-background border border-border rounded-xl p-3 text-center opacity-60">
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-xs font-semibold">{s.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.eta}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
