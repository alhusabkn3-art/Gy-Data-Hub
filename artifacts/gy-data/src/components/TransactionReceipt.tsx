import React from 'react';
import {
  Wifi, Zap, Tv, BookOpen, ArrowDownLeft, Target,
  CheckCircle2, Clock, XCircle, Share2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Shared receipt data type ─────────────────────────────────────────────────
export interface ReceiptData {
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  provider: string;
  service: string;
  description: string;
  amount: number;
  date: string;
  time?: string;
  status: 'success' | 'pending' | 'failed';
  txnId?: string;
  paymentMethod?: string;
}

// ── Network brand configs ────────────────────────────────────────────────────
const NETWORK: Record<string, { bg: string; fg: string; label: string; fontSize: number }> = {
  MTN:      { bg: '#FFCC00', fg: '#000000', label: 'MTN',    fontSize: 15 },
  Airtel:   { bg: '#E4002B', fg: '#FFFFFF', label: 'airtel', fontSize: 14 },
  Glo:      { bg: '#00A859', fg: '#FFFFFF', label: 'Glo',    fontSize: 16 },
  '9mobile':{ bg: '#00472B', fg: '#FFFFFF', label: '9mobile',fontSize: 11 },
};

// ── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  success: {
    bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D',
    accentFrom: '#16A34A', accentTo: '#22C55E',
    label: 'SUCCESSFUL', shareEmoji: '✓',
    icon: <CheckCircle2 style={{ width: 17, height: 17, color: '#16A34A', flexShrink: 0 }} />,
  },
  pending: {
    bg: '#FFFBEB', border: '#FDE68A', text: '#B45309',
    accentFrom: '#D97706', accentTo: '#F59E0B',
    label: 'PENDING', shareEmoji: '⏳',
    icon: <Clock style={{ width: 17, height: 17, color: '#D97706', flexShrink: 0 }} />,
  },
  failed: {
    bg: '#FEF2F2', border: '#FECACA', text: '#DC2626',
    accentFrom: '#DC2626', accentTo: '#EF4444',
    label: 'FAILED', shareEmoji: '✗',
    icon: <XCircle style={{ width: 17, height: 17, color: '#DC2626', flexShrink: 0 }} />,
  },
} as const;

// ── Service icon fallbacks (non-network providers) ───────────────────────────
function ServiceBadge({ type }: { type: string }) {
  const cfg: Record<string, { bg: string; color: string; Icon: typeof Wifi }> = {
    electricity: { bg: '#FFFBEB', color: '#F59E0B', Icon: Zap },
    cable:       { bg: '#F5F3FF', color: '#8B5CF6', Icon: Tv },
    exam:        { bg: '#F0FDFA', color: '#14B8A6', Icon: BookOpen },
    wallet_fund: { bg: '#F0FDF4', color: '#10B981', Icon: ArrowDownLeft },
    betting:     { bg: '#FFF1F2', color: '#EF4444', Icon: Target },
    data:        { bg: '#EFF6FF', color: '#3B82F6', Icon: Wifi },
  };
  const { bg, color, Icon } = cfg[type] ?? cfg.data;
  return (
    <div style={{
      width: 64, height: 64, borderRadius: 18,
      background: bg, border: '1.5px solid rgba(0,0,0,0.06)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon style={{ width: 28, height: 28, color }} />
    </div>
  );
}

// ── Network logo badge ───────────────────────────────────────────────────────
function ProviderBadge({ provider, type }: { provider: string; type: string }) {
  const net = NETWORK[provider];
  if (net) {
    return (
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: net.bg, color: net.fg,
        boxShadow: `0 6px 20px ${net.bg}88`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: net.fontSize,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: net.label === 'airtel' ? '0.02em' : '-0.3px',
        userSelect: 'none',
      }}>
        {net.label}
      </div>
    );
  }
  return <ServiceBadge type={type} />;
}

// ── Purchase value extractor ─────────────────────────────────────────────────
function purchaseValue(type: string, desc: string, amount: number): string {
  if (type === 'data') {
    const m = desc.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
    if (m) return `${m[1]}${m[2].toUpperCase()}`;
    return 'Data Bundle';
  }
  if (type === 'airtime') return `₦${amount.toLocaleString()}`;
  if (type === 'electricity') return 'Prepaid Token';
  if (type === 'cable') {
    const words = desc.replace(/^[^\s]+ /, '').split(' ');
    return words.join(' ') || 'Subscription';
  }
  if (type === 'exam') {
    const m = desc.match(/JAMB|WAEC|NECO|GCE/i);
    return m ? `${m[0].toUpperCase()} PIN` : 'Exam PIN';
  }
  if (type === 'wallet_fund') return `₦${amount.toLocaleString()}`;
  if (type === 'betting') return 'Wallet Fund';
  return desc;
}

// ── Dashed receipt divider ───────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{ borderTop: '1.5px dashed #D8E8F5', margin: '0' }} />
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', gap: 16,
    }}>
      <span style={{ fontSize: 13, color: '#7A95B8', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#0B1F4E', fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
interface Props {
  receipt: ReceiptData;
  onDone?: () => void;
  doneLabel?: string;
  /** When false, hides Share + Done buttons (e.g. embed in bottom sheet that has its own buttons) */
  showActions?: boolean;
}

export default function TransactionReceipt({
  receipt,
  onDone,
  doneLabel = 'Done',
  showActions = true,
}: Props) {
  const sc    = STATUS[receipt.status];
  const value = purchaseValue(receipt.type, receipt.description, receipt.amount);

  const handleShare = async () => {
    const serviceLabel =
      receipt.type === 'wallet_fund' ? 'WALLET FUNDED' :
      receipt.type === 'data' ? `${value} DATA` :
      receipt.type === 'airtime' ? 'AIRTIME' :
      receipt.service.toUpperCase();

    const text = [
      'GY DATA  •  endless joy',
      '─────────────────',
      `${receipt.provider} • ${serviceLabel}`,
      `₦${receipt.amount.toLocaleString()}`,
      `${receipt.date}${receipt.time ? ', ' + receipt.time : ''}`,
      `${sc.shareEmoji} ${sc.label}`,
      receipt.txnId ? `Ref: ${receipt.txnId}` : '',
    ].filter(Boolean).join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Receipt copied to clipboard');
      }
    } catch {
      // user cancelled share — do nothing
    }
  };

  return (
    <div>
      {/* ── Receipt card ──────────────────────────────────────────────── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: 24,
        border: '1px solid #E3EEF8',
        boxShadow: '0 8px 32px rgba(11,31,78,0.10), 0 2px 8px rgba(11,31,78,0.05)',
        overflow: 'hidden',
      }}>
        {/* Status accent bar */}
        <div style={{
          height: 4,
          background: `linear-gradient(90deg, ${sc.accentFrom}, ${sc.accentTo})`,
        }} />

        <div style={{ padding: '20px 22px 22px' }}>
          {/* Brand header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color: '#9DB4CC',
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              GY DATA
            </span>
            <div style={{
              width: 22, height: 22, borderRadius: 7,
              background: '#EFF6FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wifi style={{ width: 12, height: 12, color: '#2563EB' }} />
            </div>
          </div>

          {/* Provider logo + service label + value */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center',
            marginBottom: 20,
          }}>
            <ProviderBadge provider={receipt.provider} type={receipt.type} />
            <p style={{
              marginTop: 11, marginBottom: 6,
              fontSize: 11, fontWeight: 700, color: '#9DB4CC',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {receipt.provider}&nbsp;•&nbsp;{receipt.service}
            </p>
            <p style={{
              fontSize: receipt.type === 'data' ? 44 : 32,
              fontWeight: 900, color: '#0B1F4E',
              lineHeight: 1.05,
              letterSpacing: receipt.type === 'data' ? '-1px' : '-0.5px',
            }}>
              {value}
            </p>
          </div>

          <Divider />

          {/* Detail rows */}
          <div style={{ padding: '15px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <Row label="Amount" value={`₦${receipt.amount.toLocaleString()}`} />
            <Row
              label="Date"
              value={`${receipt.date}${receipt.time ? ', ' + receipt.time : ''}`}
            />
            {receipt.paymentMethod && (
              <Row label="Paid via" value={receipt.paymentMethod} />
            )}
          </div>

          <Divider />

          {/* Status pill */}
          <div style={{
            marginTop: 16,
            padding: '12px 18px',
            borderRadius: 14,
            background: sc.bg,
            border: `1.5px solid ${sc.border}`,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}>
            {sc.icon}
            <span style={{
              fontSize: 13, fontWeight: 800,
              color: sc.text, letterSpacing: '0.09em',
            }}>
              {sc.label}
            </span>
          </div>

          {/* Transaction ID */}
          {receipt.txnId && (
            <p style={{
              textAlign: 'center', fontSize: 10,
              color: '#B8C8DE', marginTop: 12,
              letterSpacing: '0.05em',
              fontFamily: 'monospace',
            }}>
              {receipt.txnId}
            </p>
          )}
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      {showActions && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              flex: 1, height: 50, borderRadius: 14,
              background: '#F0FDF4',
              border: '1.5px solid #BBF7D0',
              color: '#15803D',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#DCFCE7'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
          >
            <Share2 style={{ width: 15, height: 15 }} />
            Share
          </button>

          {/* Done button */}
          {onDone && (
            <button
              onClick={onDone}
              style={{
                flex: 2, height: 50, borderRadius: 14,
                background: 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
                boxShadow: '0 6px 20px rgba(37,99,235,0.35)',
                border: 'none',
                color: '#FFFFFF',
                fontSize: 14, fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              {doneLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
