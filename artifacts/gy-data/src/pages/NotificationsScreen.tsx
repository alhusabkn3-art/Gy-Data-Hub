import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellOff, ChevronLeft, Check, Trash2,
  CheckCircle2, XCircle, Clock, ArrowDownLeft,
  Wifi, Zap, RotateCcw, Gift, ShieldAlert,
} from 'lucide-react';
import { useLocation } from 'wouter';
import type { Notification } from '../data/mockData';
import { useNotifications } from '../hooks/useNotifications';
import TransactionDetailModal from '../components/TransactionDetailModal';

// ── Notification visual config ────────────────────────────────────────────────

interface NotifConfig {
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  accent: string;
}

function getNotifConfig(type: string, title: string): NotifConfig {
  const t = title.toLowerCase();

  if (type === 'transaction') {
    if (t.includes('failed') || t.includes('unsuccessful'))
      return { Icon: XCircle,       iconColor: '#EF4444', iconBg: '#FEF2F2', accent: '#DC2626' };
    if (t.includes('pending'))
      return { Icon: Clock,         iconColor: '#F59E0B', iconBg: '#FFFBEB', accent: '#D97706' };
    if (t.includes('fund') || t.includes('funded') || t.includes('wallet'))
      return { Icon: ArrowDownLeft, iconColor: '#10B981', iconBg: '#ECFDF5', accent: '#059669' };
    if (t.includes('cashback') || t.includes('refund') || t.includes('return') || t.includes('reversed'))
      return { Icon: RotateCcw,     iconColor: '#6366F1', iconBg: '#EEF2FF', accent: '#4F46E5' };
    if (t.includes('airtime'))
      return { Icon: Zap,           iconColor: '#16A34A', iconBg: '#F0FDF4', accent: '#15803D' };
    if (t.includes('data'))
      return { Icon: Wifi,          iconColor: '#16A34A', iconBg: '#F0FDF4', accent: '#15803D' };
    // generic success transaction
    return   { Icon: CheckCircle2,  iconColor: '#16A34A', iconBg: '#F0FDF4', accent: '#15803D' };
  }

  if (type === 'promo')
    return { Icon: Gift,       iconColor: '#EC4899', iconBg: '#FDF2F8', accent: '#DB2777' };
  if (type === 'security')
    return { Icon: ShieldAlert, iconColor: '#F59E0B', iconBg: '#FFFBEB', accent: '#D97706' };

  // system / default (welcome, announcements, etc.)
  return { Icon: Bell, iconColor: '#3B82F6', iconBg: '#EFF6FF', accent: '#2563EB' };
}

// ── Date section grouping ─────────────────────────────────────────────────────

const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];

function getDateGroup(createdAt: string): string {
  const now  = new Date();
  const d    = new Date(createdAt);
  // Compare calendar days in local time
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tDay   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const diff   = Math.round((nowDay.getTime() - tDay.getTime()) / 86_400_000);

  if (diff <= 0)  return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return 'This Week';
  return 'Earlier';
}

// ── Notification card ─────────────────────────────────────────────────────────

function NotifCard({
  notif,
  onTap,
  onDelete,
}: {
  notif:    Notification;
  onTap:    (n: Notification) => void;
  onDelete: (id: string) => void;
}) {
  const { Icon, iconColor, iconBg, accent } = getNotifConfig(notif.type, notif.title);
  const isUnread = !notif.read;
  const isLinked = notif.type === 'transaction' && !!notif.refId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -28, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="relative"
    >
      <button
        onClick={() => onTap(notif)}
        className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.985] relative overflow-hidden ${
          isUnread
            ? 'bg-card border-primary/20 shadow-[0_2px_16px_rgba(37,99,235,0.07)]'
            : 'bg-background border-border'
        }`}
      >
        {/* Left accent bar */}
        {isUnread && (
          <div
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
            style={{ background: accent }}
          />
        )}

        <div className="flex gap-3 pl-1">
          {/* Icon circle */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border"
            style={{
              background:  isUnread ? iconBg    : '#F8FAFF',
              borderColor: isUnread ? `${iconColor}22` : '#E8EDF8',
            }}
          >
            <Icon style={{ width: 18, height: 18, color: isUnread ? iconColor : '#94A3B8' }} />
          </div>

          {/* Text block */}
          <div className="flex-1 min-w-0 pr-5">
            <div className="flex items-start gap-2 mb-0.5">
              <h3
                className="text-sm font-semibold leading-snug flex-1"
                style={{ color: isUnread ? '#0B1F4E' : '#64748B' }}
              >
                {notif.title}
              </h3>
              {isUnread && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: accent }}
                />
              )}
            </div>

            <p
              className="text-xs leading-relaxed mb-2 line-clamp-2"
              style={{ color: isUnread ? '#64748B' : '#94A3B8' }}
            >
              {notif.body}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium" style={{ color: '#B0BEC5' }}>
                {notif.timestamp}
              </span>
              {isLinked && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{
                    color:      isUnread ? accent : '#94A3B8',
                    background: isUnread ? `${accent}12` : '#F1F5F9',
                  }}
                >
                  View receipt →
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
        style={{ color: '#CBD5E1' }}
        aria-label="Delete notification"
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </motion.div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="flex flex-col items-center justify-center py-24 px-8 text-center"
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
        style={{
          background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFF 100%)',
          border: '1.5px solid #DDEAFF',
          boxShadow: '0 4px 20px rgba(37,99,235,0.08)',
        }}
      >
        <BellOff className="w-8 h-8" style={{ color: '#93C5FD' }} />
      </div>
      <h3 className="font-bold text-base mb-2" style={{ color: '#0B1F4E' }}>
        All caught up
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: '#94A3B8', maxWidth: 200 }}>
        Transaction alerts and account updates will appear here.
      </p>
    </motion.div>
  );
}

// ── Clear-all confirm sheet ───────────────────────────────────────────────────

function ClearConfirmSheet({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, y: 64 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 64 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8 pt-2 max-w-md mx-auto"
      >
        <div className="bg-card rounded-2xl p-6 border border-border shadow-xl">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#FEF2F2', border: '1.5px solid #FECACA' }}
          >
            <Trash2 className="w-5 h-5 text-destructive" />
          </div>
          <h3 className="font-bold text-base text-center mb-1.5">Clear all notifications?</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
            All notifications will be permanently removed. This can't be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 h-12 rounded-xl border border-border bg-background font-semibold text-sm transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 h-12 rounded-xl font-semibold text-sm text-white transition-all active:scale-95"
              style={{ background: '#DC2626' }}
            >
              Clear all
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const [, setLocation] = useLocation();
  const { notifications, unreadCount, markAllRead, markRead, remove, clearAll } = useNotifications();
  const [detailTxnId,     setDetailTxnId]     = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Group by time section
  const grouped = useMemo(() => {
    const map: Record<string, Notification[]> = {};
    for (const n of notifications) {
      const g = getDateGroup(n.createdAt);
      (map[g] ??= []).push(n);
    }
    return GROUP_ORDER
      .filter(g => (map[g]?.length ?? 0) > 0)
      .map(g => ({ label: g, items: map[g]! }));
  }, [notifications]);

  const handleTap = async (notif: Notification) => {
    // Always mark as read when tapped
    if (!notif.read) await markRead(notif.id);
    // Open receipt sheet for transaction notifications with a linked entity
    if (notif.type === 'transaction' && notif.refId) {
      setDetailTxnId(notif.refId);
    }
  };

  const handleClearConfirm = async () => {
    setShowClearConfirm(false);
    await clearAll();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation('/')}
            className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-xl font-bold leading-tight">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-xs font-semibold" style={{ color: '#2563EB' }}>
                {unreadCount} unread
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={markAllRead}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-full active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </motion.button>
            )}
          </AnimatePresence>

          {notifications.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="w-9 h-9 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-red-200 hover:bg-red-50 active:scale-90 transition-all"
              aria-label="Clear all notifications"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Notification list / empty state ───────────────────────────────── */}
      {notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-7 pb-10">
          {grouped.map(({ label, items }) => (
            <section key={label}>
              {/* Section label */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: '#94A3B8' }}
                >
                  {label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <AnimatePresence mode="popLayout" initial={false}>
                <div className="space-y-2.5">
                  {items.map(n => (
                    <NotifCard
                      key={n.id}
                      notif={n}
                      onTap={handleTap}
                      onDelete={remove}
                    />
                  ))}
                </div>
              </AnimatePresence>
            </section>
          ))}
        </div>
      )}

      {/* ── Clear all confirm sheet ────────────────────────────────────────── */}
      <AnimatePresence>
        {showClearConfirm && (
          <ClearConfirmSheet
            onConfirm={handleClearConfirm}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Transaction receipt bottom sheet ──────────────────────────────── */}
      <TransactionDetailModal
        open={!!detailTxnId}
        onClose={() => setDetailTxnId(null)}
        transactionId={detailTxnId ?? ''}
      />
    </motion.div>
  );
}
