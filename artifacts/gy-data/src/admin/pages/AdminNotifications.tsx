import React, { useState, useEffect } from 'react';
import { Bell, Plus, Send, FileText, X, Users, UserCheck, Crown, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { StatusBadge } from './AdminDashboard';
import { Announcement } from '../data/adminMockData';
import { toast } from 'sonner';
import { apiGetNotificationHistory, NotificationHistoryEntry } from '../utils/adminApi';

const targetIcons: Record<string, React.ElementType> = {
  all: Users,
  verified: UserCheck,
  unverified: Bell,
};

const targetLabels: Record<string, string> = {
  all: 'All Users',
  verified: 'KYC Verified',
  unverified: 'Unverified',
};

export default function AdminNotifications() {
  const { announcements, addAnnouncement, stats, isSuperAdmin, broadcastNotification } = useAdminContext();
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'verified' | 'unverified'>('all');
  const [sendAs, setSendAs] = useState<'sent' | 'draft'>('sent');
  const [broadcasting, setBroadcasting] = useState(false);

  const [notifHistory, setNotifHistory] = useState<NotificationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadHistory(1);
  }, [isSuperAdmin]);

  const loadHistory = async (page: number) => {
    setHistoryLoading(true);
    try {
      const result = await apiGetNotificationHistory(page);
      setNotifHistory(result.notifications);
      setHistoryPage(page);
      setHistoryPages(result.pages);
    } catch (err) {
      // silent — history is best-effort
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and message body are required.');
      return;
    }

    // Super admin "Send Now" → real broadcast
    if (isSuperAdmin && sendAs === 'sent') {
      setBroadcasting(true);
      try {
        const result = await broadcastNotification(title.trim(), body.trim());
        if (result.ok) {
          toast.success(`Broadcast sent to ${result.sent} users`);
          addAnnouncement({ title: title.trim(), body: body.trim(), target, status: 'sent' });
          setTitle(''); setBody(''); setTarget('all'); setSendAs('sent');
          setShowCompose(false);
          // Refresh history
          loadHistory(1);
        } else {
          toast.error(result.error ?? 'Broadcast failed.');
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Broadcast failed.');
      } finally {
        setBroadcasting(false);
      }
      return;
    }

    // Draft or non-super-admin send → local only
    addAnnouncement({ title: title.trim(), body: body.trim(), target, status: sendAs });
    toast.success(sendAs === 'sent' ? 'Announcement sent!' : 'Saved as draft.');
    setTitle(''); setBody(''); setTarget('all'); setSendAs('sent');
    setShowCompose(false);
  };

  const sent = announcements.filter(a => a.status === 'sent');
  const drafts = announcements.filter(a => a.status === 'draft');

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sent.length} sent · {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xl font-bold">{announcements.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xl font-bold text-green-400">{sent.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Sent</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xl font-bold text-zinc-400">{drafts.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Drafts</p>
        </div>
      </div>

      {/* Announcements list */}
      <div className="space-y-3">
        {announcements.map(ann => {
          const TargetIcon = targetIcons[ann.target] ?? Bell;
          return (
            <div key={ann.id} className="bg-card border border-border rounded-2xl p-4 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    ann.status === 'sent' ? 'bg-green-500/10 border border-green-500/20' :
                    ann.status === 'draft' ? 'bg-zinc-500/10 border border-zinc-500/20' :
                    'bg-blue-500/10 border border-blue-500/20'
                  }`}>
                    {ann.status === 'sent' ? <Send className="w-4 h-4 text-green-400" /> :
                     ann.status === 'draft' ? <FileText className="w-4 h-4 text-zinc-400" /> :
                     <Bell className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm leading-tight">{ann.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ann.body}</p>
                  </div>
                </div>
                <StatusBadge status={ann.status} />
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TargetIcon className="w-3 h-3" />
                  <span>{targetLabels[ann.target]}</span>
                </div>
                {ann.recipients > 0 && (
                  <>
                    <span>·</span>
                    <span>{ann.recipients.toLocaleString()} recipients</span>
                  </>
                )}
                <span>·</span>
                <span>{ann.sentAt}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notification History — Super Admin only */}
      {isSuperAdmin && (
        <div className="bg-card border border-amber-500/20 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm">Notification History</h2>
              <span className="text-[10px] font-semibold text-amber-400 border border-amber-400/30 bg-amber-500/8 rounded-full px-2 py-0.5">Super Admin</span>
            </div>
            <span className="text-xs text-muted-foreground">{notifHistory.length} notifications</span>
          </div>

          {historyLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-4 bg-white/10 rounded flex-1" />
                  <div className="h-4 bg-white/10 rounded w-24" />
                  <div className="h-4 bg-white/10 rounded w-16" />
                  <div className="h-4 bg-white/10 rounded w-10" />
                  <div className="h-4 bg-white/10 rounded w-20" />
                </div>
              ))}
            </div>
          ) : notifHistory.length === 0 ? (
            <div className="p-10 text-center">
              <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No notifications sent yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-background/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-semibold">User</th>
                    <th className="text-left px-4 py-3 font-semibold">Title</th>
                    <th className="text-left px-4 py-3 font-semibold">Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Read</th>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {notifHistory.map(n => (
                    <tr key={n.id} className="border-b border-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="text-foreground font-medium">{n.userName}</span>
                        {' · '}
                        <span>{n.userPhone}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{n.title}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                          {n.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {n.read
                          ? <span className="text-green-400">Yes</span>
                          : <span className="text-muted-foreground">No</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {historyPages > 1 && (
            <div className="p-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Page {historyPage} of {historyPages}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadHistory(historyPage - 1)}
                  disabled={historyPage <= 1 || historyLoading}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => loadHistory(historyPage + 1)}
                  disabled={historyPage >= historyPages || historyLoading}
                  className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compose Modal */}
      {showCompose && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={() => !broadcasting && setShowCompose(false)}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-5 max-w-md mx-auto shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold">New Announcement</h2>
              <button
                onClick={() => !broadcasting && setShowCompose(false)}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-40"
                disabled={broadcasting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Title</label>
                <input
                  type="text"
                  placeholder="Announcement title…"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Message</label>
                <textarea
                  placeholder="Write your announcement here…"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={4}
                  className="w-full bg-background border border-border focus:border-primary rounded-xl px-3 py-3 text-sm outline-none transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Target Audience</label>
                <select
                  value={target}
                  onChange={e => setTarget(e.target.value as typeof target)}
                  className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
                >
                  <option value="all">All Users{stats ? ` (${stats.totalUsers.toLocaleString()})` : ''}</option>
                  <option value="verified">KYC Verified Only{stats ? ` (${stats.verifiedUsers.toLocaleString()})` : ''}</option>
                  <option value="unverified">Unverified Only{stats ? ` (${stats.unverifiedUsers.toLocaleString()})` : ''}</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setSendAs('draft'); handleSend(); }}
                  disabled={broadcasting}
                  className="flex-1 h-11 border-2 border-border text-muted-foreground hover:text-foreground hover:border-white/20 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" /> Save Draft
                </button>
                <button
                  onClick={() => { setSendAs('sent'); handleSend(); }}
                  disabled={broadcasting}
                  className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-70 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                >
                  {broadcasting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send Now</>
                  }
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
