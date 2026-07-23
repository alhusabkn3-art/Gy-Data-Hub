import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users2, Plus, Edit2, Trash2, X, Search, Calendar, Clock,
  Activity, Award, DollarSign, UserCheck, UserX, Download,
  ChevronDown, CheckCircle2,
} from 'lucide-react';
import {
  apiGetStaff, apiCreateStaff, apiUpdateStaff, apiDeleteStaff,
  apiGetStaffAttendance, apiMarkAttendance, apiGetStaffActivityLogs,
  exportToCsv,
  type StaffMember, type StaffAttendanceRecord, type StaffActivityEntry,
} from '../utils/adminApi';
import { fmtNaira } from '../utils/format';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ── Badge components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-500/15 text-green-400 border border-green-500/25',
    inactive: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/25',
    suspended: 'bg-red-500/15 text-red-400 border border-red-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? map.inactive}`}>
      {status}
    </span>
  );
}

function RankBadge({ rank }: { rank: string }) {
  const map: Record<string, string> = {
    junior: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    mid: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    senior: 'bg-green-500/10 text-green-400 border border-green-500/20',
    lead: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    manager: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[rank] ?? map.junior}`}>
      {rank}
    </span>
  );
}

function AttendanceBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: 'bg-green-500/15 text-green-400',
    absent: 'bg-red-500/15 text-red-400',
    late: 'bg-yellow-500/15 text-yellow-400',
    leave: 'bg-blue-500/15 text-blue-400',
    holiday: 'bg-zinc-500/15 text-zinc-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? map.absent}`}>
      {status}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-white mb-1">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// ── Form defaults ─────────────────────────────────────────────────────────────

interface StaffForm {
  name: string; email: string; phone: string; role: string;
  rank: string; department: string; salary: string;
  salaryPaymentDay: string; status: string; notes: string;
}

const defaultForm: StaffForm = {
  name: '', email: '', phone: '', role: '', rank: 'junior',
  department: '', salary: '', salaryPaymentDay: '28',
  status: 'active', notes: '',
};

function formFromStaff(s: StaffMember): StaffForm {
  return {
    name: s.name, email: s.email ?? '', phone: s.phone ?? '',
    role: s.role, rank: s.rank, department: s.department ?? '',
    salary: String(s.salary), salaryPaymentDay: String(s.salaryPaymentDay),
    status: s.status, notes: s.notes ?? '',
  };
}

// ── Input component ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground';

// ── Add / Edit Staff Modal ────────────────────────────────────────────────────

interface StaffModalProps {
  editing: StaffMember | null;
  onClose: () => void;
  onSaved: () => void;
}

function StaffModal({ editing, onClose, onSaved }: StaffModalProps) {
  const [form, setForm] = useState<StaffForm>(editing ? formFromStaff(editing) : defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: keyof StaffForm, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload: Partial<StaffMember> = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role.trim(),
        rank: form.rank,
        department: form.department.trim() || null,
        salary: parseFloat(form.salary) || 0,
        salaryPaymentDay: parseInt(form.salaryPaymentDay, 10) || 28,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await apiUpdateStaff(editing.id, payload);
      } else {
        await apiCreateStaff(payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save staff member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-lg w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white">{editing ? 'Edit Staff Member' : 'Add Staff Member'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Fill in the details below</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Full Name *">
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Doe" />
            </Field>
          </div>
          <Field label="Email">
            <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </Field>
          <Field label="Phone">
            <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="08012345678" />
          </Field>
          <Field label="Role / Title">
            <input className={inputCls} value={form.role} onChange={e => set('role', e.target.value)} placeholder="Support Agent" />
          </Field>
          <Field label="Rank">
            <select className={inputCls} value={form.rank} onChange={e => set('rank', e.target.value)}>
              {['junior', 'mid', 'senior', 'lead', 'manager'].map(r => (
                <option key={r} value={r} className="bg-[#0D1F3C]">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <input className={inputCls} value={form.department} onChange={e => set('department', e.target.value)} placeholder="Operations" />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              {['active', 'inactive', 'suspended'].map(s => (
                <option key={s} value={s} className="bg-[#0D1F3C]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Monthly Salary (₦)">
            <input className={inputCls} type="number" min="0" value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="150000" />
          </Field>
          <Field label="Pay Day (1–28)">
            <input className={inputCls} type="number" min="1" max="28" value={form.salaryPaymentDay} onChange={e => set('salaryPaymentDay', e.target.value)} placeholder="28" />
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any additional notes…"
              />
            </Field>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> {editing ? 'Save Changes' : 'Add Staff'}</>}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Mark Attendance Mini-Modal ────────────────────────────────────────────────

interface MarkAttendanceModalProps {
  staffId: string;
  onClose: () => void;
  onSaved: () => void;
}

function MarkAttendanceModal({ staffId, onClose, onSaved }: MarkAttendanceModalProps) {
  const [date, setDate] = useState(todayDate());
  const [status, setStatus] = useState('present');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!date) { setError('Date is required.'); return; }
    setError('');
    setSaving(true);
    try {
      await apiMarkAttendance(staffId, { date, status, notes: notes.trim() || undefined });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to mark attendance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-sm w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Mark Attendance</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}

        <div className="space-y-4">
          <Field label="Date">
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
              {['present', 'absent', 'late', 'leave', 'holiday'].map(s => (
                <option key={s} value={s} className="bg-[#0D1F3C]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks…" />
          </Field>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</> : 'Mark Attendance'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  staff: StaffMember;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({ staff, onClose, onDeleted }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiDeleteStaff(staff.id);
      onDeleted();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-sm w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-base font-bold text-white text-center mb-1">Remove Staff Member?</h2>
        <p className="text-xs text-muted-foreground text-center mb-4">
          This will permanently remove <span className="text-white font-medium">{staff.name}</span> from the system.
        </p>
        {error && <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Removing…' : 'Remove'}
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Attendance Summary ────────────────────────────────────────────────────────

function AttendanceSummary({ records }: { records: StaffAttendanceRecord[] }) {
  const counts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    { label: 'Present', count: counts.present ?? 0, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Absent', count: counts.absent ?? 0, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Late', count: counts.late ?? 0, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Leave', count: counts.leave ?? 0, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Holiday', count: counts.holiday ?? 0, color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  ];

  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {stats.map(s => (
        <div key={s.label} className={`${s.bg} rounded-xl p-3 border border-white/[0.06] text-center`}>
          <p className={`text-lg font-bold ${s.color}`}>{s.count}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'directory', label: 'Directory', icon: Users2 },
  { id: 'attendance', label: 'Attendance', icon: Calendar },
  { id: 'activity', label: 'Activity Logs', icon: Activity },
] as const;

type Tab = (typeof TABS)[number]['id'];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function StaffManagement() {
  const [tab, setTab] = useState<Tab>('directory');

  // Directory state
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [search, setSearch] = useState('');
  const [modalType, setModalType] = useState<'add' | 'edit' | 'delete' | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // Attendance state
  const [attendanceStaffId, setAttendanceStaffId] = useState('');
  const [attendanceMonth, setAttendanceMonth] = useState(currentMonth());
  const [attendance, setAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [markAttendanceOpen, setMarkAttendanceOpen] = useState(false);

  // Activity state
  const [activityStaffId, setActivityStaffId] = useState('');
  const [activityLogs, setActivityLogs] = useState<StaffActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Load staff on mount
  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const res = await apiGetStaff();
      setStaff(res.staff);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  // Load attendance when staff/month changes
  const loadAttendance = useCallback(async () => {
    if (!attendanceStaffId) return;
    setLoadingAttendance(true);
    try {
      const res = await apiGetStaffAttendance(attendanceStaffId, attendanceMonth);
      setAttendance(res.attendance);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load attendance');
      setAttendance([]);
    } finally {
      setLoadingAttendance(false);
    }
  }, [attendanceStaffId, attendanceMonth]);

  useEffect(() => { if (tab === 'attendance') loadAttendance(); }, [tab, loadAttendance]);

  // Load activity logs
  const loadActivity = useCallback(async () => {
    if (!activityStaffId) return;
    setLoadingActivity(true);
    try {
      const res = await apiGetStaffActivityLogs(activityStaffId);
      setActivityLogs(res.logs);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load activity logs');
      setActivityLogs([]);
    } finally {
      setLoadingActivity(false);
    }
  }, [activityStaffId]);

  useEffect(() => { if (tab === 'activity') loadActivity(); }, [tab, loadActivity]);

  // Filtered directory
  const filtered = staff.filter(s => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q)
    );
  });

  function handleExport() {
    exportToCsv(
      filtered.map(s => ({
        Name: s.name, Email: s.email ?? '', Phone: s.phone ?? '',
        Role: s.role, Rank: s.rank, Department: s.department ?? '',
        Salary: s.salary, 'Pay Day': s.salaryPaymentDay,
        Status: s.status, Notes: s.notes ?? '',
      })),
      'staff-export.csv',
    );
  }

  const attendanceStaffMember = staff.find(s => s.id === attendanceStaffId);
  const activityStaffMember = staff.find(s => s.id === activityStaffId);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Staff Management</h1>
              <p className="text-xs text-muted-foreground">Manage team members, attendance & activity</p>
            </div>
          </div>
          {tab === 'directory' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <button
                onClick={() => { setSelectedStaff(null); setModalType('add'); }}
                className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            </div>
          )}
          {tab === 'attendance' && attendanceStaffId && (
            <button
              onClick={() => setMarkAttendanceOpen(true)}
              className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Mark Attendance
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 pt-5">
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* ── DIRECTORY TAB ─────────────────────────────────────────────── */}
          {tab === 'directory' && (
            <motion.div
              key="directory"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* Search */}
              <div className="mb-5">
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                    placeholder="Search by name, email, role…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Table */}
              <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name / Role</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rank</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salary</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pay Day</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingStaff ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-white/[0.06]">
                            {Array.from({ length: 7 }).map((__, j) => (
                              <td key={j} className="px-4 py-3">
                                <Skeleton className="h-4 w-24" />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState icon={Users2} title="No staff found" subtitle={search ? 'Try adjusting your search' : 'Add your first staff member to get started'} />
                          </td>
                        </tr>
                      ) : (
                        filtered.map(s => (
                          <tr key={s.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                  {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{s.name}</p>
                                  <p className="text-xs text-muted-foreground">{s.email ?? s.phone ?? s.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><RankBadge rank={s.rank} /></td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{s.department ?? '—'}</td>
                            <td className="px-4 py-3 text-sm text-white font-medium">{fmtNaira(s.salary)}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">Day {s.salaryPaymentDay}</td>
                            <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => { setSelectedStaff(s); setModalType('edit'); }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setSelectedStaff(s); setModalType('delete'); }}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {!loadingStaff && filtered.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 px-1">
                  Showing {filtered.length} of {staff.length} staff members
                </p>
              )}
            </motion.div>
          )}

          {/* ── ATTENDANCE TAB ────────────────────────────────────────────── */}
          {tab === 'attendance' && (
            <motion.div
              key="attendance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <select
                    className={inputCls}
                    value={attendanceStaffId}
                    onChange={e => { setAttendanceStaffId(e.target.value); setAttendance([]); }}
                  >
                    <option value="" className="bg-[#0D1F3C]">— Select Staff Member —</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#0D1F3C]">{s.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="month"
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                  value={attendanceMonth}
                  onChange={e => setAttendanceMonth(e.target.value)}
                />
                {attendanceStaffId && (
                  <button
                    onClick={loadAttendance}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
                  >
                    <Clock className="w-4 h-4" /> Load
                  </button>
                )}
              </div>

              {!attendanceStaffId ? (
                <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06]">
                  <EmptyState icon={Calendar} title="Select a staff member" subtitle="Choose a staff member and month to view attendance records" />
                </div>
              ) : loadingAttendance ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : (
                <>
                  {attendance.length > 0 && <AttendanceSummary records={attendance} />}
                  <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{attendanceStaffMember?.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {attendanceMonth} · {attendance.length} records
                        </p>
                      </div>
                    </div>
                    {attendance.length === 0 ? (
                      <EmptyState icon={Calendar} title="No attendance records" subtitle="Mark attendance for this staff member" />
                    ) : (
                      <div className="divide-y divide-white/[0.06]">
                        {attendance.map(rec => (
                          <div key={rec.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                            <div className="w-24 flex-shrink-0">
                              <p className="text-xs font-medium text-white">{fmtDate(rec.date)}</p>
                            </div>
                            <AttendanceBadge status={rec.status} />
                            <div className="flex items-center gap-3 ml-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> In: {fmtTime(rec.checkIn)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Out: {fmtTime(rec.checkOut)}
                              </span>
                            </div>
                            {rec.notes && (
                              <p className="text-xs text-muted-foreground ml-auto max-w-xs truncate italic">
                                {rec.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── ACTIVITY LOGS TAB ─────────────────────────────────────────── */}
          {tab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mb-5">
                <select
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full max-w-xs focus:outline-none focus:border-primary/50"
                  value={activityStaffId}
                  onChange={e => { setActivityStaffId(e.target.value); setActivityLogs([]); }}
                >
                  <option value="" className="bg-[#0D1F3C]">— Select Staff Member —</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#0D1F3C]">{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
                {!activityStaffId ? (
                  <EmptyState icon={Activity} title="Select a staff member" subtitle="Choose a staff member to view their activity logs" />
                ) : loadingActivity ? (
                  <div className="p-5 space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : activityLogs.length === 0 ? (
                  <EmptyState icon={Activity} title="No activity logs" subtitle={`No activity recorded for ${activityStaffMember?.name ?? 'this staff member'}`} />
                ) : (
                  <>
                    <div className="px-5 py-4 border-b border-white/[0.06]">
                      <p className="text-sm font-semibold text-white">{activityStaffMember?.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{activityLogs.length} activity records</p>
                    </div>
                    <div className="divide-y divide-white/[0.06]">
                      {activityLogs.map(log => (
                        <div key={log.id} className="flex items-start gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white">{log.action}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.createdAt).toLocaleString('en-NG')}
                              </span>
                              {log.ipAddress && (
                                <span className="text-xs text-muted-foreground font-mono bg-white/5 px-1.5 py-0.5 rounded">
                                  {log.ipAddress}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {(modalType === 'add' || (modalType === 'edit' && selectedStaff)) && (
          <StaffModal
            key="staff-modal"
            editing={modalType === 'edit' ? selectedStaff : null}
            onClose={() => setModalType(null)}
            onSaved={loadStaff}
          />
        )}
        {modalType === 'delete' && selectedStaff && (
          <DeleteModal
            key="delete-modal"
            staff={selectedStaff}
            onClose={() => setModalType(null)}
            onDeleted={loadStaff}
          />
        )}
        {markAttendanceOpen && attendanceStaffId && (
          <MarkAttendanceModal
            key="mark-attendance-modal"
            staffId={attendanceStaffId}
            onClose={() => setMarkAttendanceOpen(false)}
            onSaved={loadAttendance}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
