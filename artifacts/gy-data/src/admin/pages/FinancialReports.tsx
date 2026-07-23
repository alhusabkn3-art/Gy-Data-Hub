import React, { useState, useEffect, useRef } from 'react';
import { BarChart2, TrendingUp, ArrowUpRight, ArrowDownLeft, RotateCcw, RefreshCw, Calendar, Crown, Download } from 'lucide-react';
import { apiGetFinancialReport, FinancialReport, exportToCsv, exportToHtmlPrint } from '../utils/adminApi';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import { toast } from 'sonner';

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

export default function FinancialReports() {
  const defaults = defaultDateRange();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const fetchReport = async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetFinancialReport(from, to);
      setReport(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load report';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(defaults.from, defaults.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both dates');
      return;
    }
    fetchReport(fromDate, toDate);
  };

  const successRate =
    report && report.transactions.totalCount > 0
      ? ((report.transactions.successfulCount / report.transactions.totalCount) * 100).toFixed(1)
      : '0.0';

  const sortedDaily = report
    ? [...report.dailyRevenue].sort((a, b) => b.day.localeCompare(a.day))
    : [];

  return (
    <div className="min-h-screen bg-[#0A1628] text-foreground p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BarChart2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-white">Financial Reports</h1>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Crown className="w-3 h-3" /> Super Admin
            </span>
          </div>
          <p className="text-muted-foreground text-sm">Revenue, transaction analytics and service breakdown</p>
        </div>
        <div className="relative" ref={exportMenuRef}>
          <button onClick={()=>setExportMenuOpen(v=>!v)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-xl text-sm font-medium hover:bg-primary/30 transition-colors">
            <Download className="w-4 h-4"/>
            Export
            <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </button>
          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-[#0D1F3C] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
              <button onClick={()=>{ setExportMenuOpen(false);
                if(!report) return;
                exportToCsv([
                  ...report.dailyRevenue.map(d=>({'Date':d.day,'Revenue (₦)':d.revenue,'Transactions':d.count})),
                ],'gy-data-daily-report.csv');
              }} className="w-full px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors">Export as CSV</button>
              <button onClick={()=>{ setExportMenuOpen(false);
                if(!report) return;
                exportToHtmlPrint('GY DATA Financial Report',
                  report.dailyRevenue.map(d=>({'Date':d.day,'Revenue (₦)':d.revenue.toLocaleString(),'Transactions':d.count})),
                  'report.html');
              }} className="w-full px-4 py-2.5 text-sm text-left hover:bg-white/5 border-t border-white/[0.06] transition-colors">Export as PDF</button>
            </div>
          )}
        </div>
      </div>

      {/* DATE RANGE ROW */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <TrendingUp className="w-4 h-4" />
            )}
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-28" />
          ))}
        </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <p className="text-red-400 font-medium">{error}</p>
          <button
            onClick={() => fetchReport(fromDate, toDate)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && !error && report === null && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-8 flex flex-col items-center gap-2 text-center">
          <BarChart2 className="w-10 h-10 text-blue-400 mb-1" />
          <p className="text-blue-300 font-semibold">Select a date range and click Generate Report</p>
          <p className="text-muted-foreground text-sm">Your financial summary will appear here</p>
        </div>
      )}

      {/* REPORT CONTENT */}
      {!loading && !error && report && (
        <div className="space-y-6">
          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total Revenue</span>
                <ArrowUpRight className="w-4 h-4 text-green-400" />
              </div>
              <p className="text-xl font-bold text-green-400">{fmtNaira(report.transactions.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Successful transactions</p>
            </div>

            {/* Total Transactions */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total Transactions</span>
                <BarChart2 className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xl font-bold text-white">{report.transactions.totalCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {report.transactions.successfulCount} succeeded · {report.transactions.failedCount} failed
              </p>
            </div>

            {/* Success Rate */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Success Rate</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-emerald-400">{successRate}%</p>
              <p className="text-xs text-muted-foreground">{report.transactions.pendingCount} pending</p>
            </div>

            {/* Wallet Funding */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Wallet Funding</span>
                <ArrowUpRight className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-bold text-blue-400">{fmtNaira(report.transactions.walletFunding)}</p>
              <p className="text-xs text-muted-foreground">Total funded</p>
            </div>

            {/* Manual Credits */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Manual Credits</span>
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xl font-bold text-amber-400">{fmtNaira(report.wallet.totalManualCredits)}</p>
              <p className="text-xs text-muted-foreground">Admin-issued credits</p>
            </div>

            {/* Manual Debits */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Manual Debits</span>
                <ArrowDownLeft className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-xl font-bold text-red-400">{fmtNaira(report.wallet.totalManualDebits)}</p>
              <p className="text-xs text-muted-foreground">Admin-issued debits</p>
            </div>

            {/* Total Reversals */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Total Reversals</span>
                <RotateCcw className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-bold text-purple-400">{report.reversals.count.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{fmtNaira(report.reversals.totalAmount)} reversed</p>
            </div>

            {/* Failed Value */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Failed Value</span>
                <ArrowDownLeft className="w-4 h-4 text-red-300/60" />
              </div>
              <p className="text-xl font-bold text-red-300/70">{fmtNaira(report.transactions.failedValue)}</p>
              <p className="text-xs text-muted-foreground">Lost to failures</p>
            </div>

            {/* Est. Net Profit */}
            <div className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06]">
              <p className="text-xs text-muted-foreground mb-1">Est. Net Profit</p>
              <p className="text-xl font-bold text-green-400">₦{((report?.transactions?.totalRevenue ?? 0) * 0.08).toLocaleString('en-NG', {minimumFractionDigits:2,maximumFractionDigits:2})}</p>
              <p className="text-xs text-muted-foreground mt-1">~8% estimated margin</p>
            </div>
          </div>

          {/* SERVICE BREAKDOWN */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" /> Revenue by Service
            </h2>
            {report.serviceBreakdown.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No service data available for this period</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Service</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Revenue</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Transactions</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Avg per Txn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.serviceBreakdown.map(row => {
                      const cfg = SERVICE_CONFIG[row.type];
                      const avg = row.count > 0 ? row.revenue / row.count : 0;
                      return (
                        <tr key={row.type} className="border-b border-border/50 hover:bg-background/40 transition-colors">
                          <td className="py-3 px-3 text-white font-medium">
                            <span className="mr-2">{cfg?.icon ?? '🔧'}</span>
                            {cfg?.label ?? row.type}
                          </td>
                          <td className="py-3 px-3 text-right text-green-400 font-semibold">{fmtNaira(row.revenue)}</td>
                          <td className="py-3 px-3 text-right text-white">{row.count.toLocaleString()}</td>
                          <td className="py-3 px-3 text-right text-muted-foreground">{fmtNaira(avg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DAILY REVENUE */}
          {sortedDaily.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Daily Revenue
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Date</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Revenue</th>
                      <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDaily.map(row => (
                      <tr key={row.day} className="border-b border-border/50 hover:bg-background/40 transition-colors">
                        <td className="py-3 px-3 text-white font-mono text-xs">{row.day}</td>
                        <td className="py-3 px-3 text-right text-green-400 font-semibold">{fmtNaira(row.revenue)}</td>
                        <td className="py-3 px-3 text-right text-white">{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
