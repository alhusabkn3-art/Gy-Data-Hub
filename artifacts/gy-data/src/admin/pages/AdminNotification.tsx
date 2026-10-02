// FILE: artifacts/gy-data/src/admin/pages/AdminNotifications.tsx

import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  FileText,
  Megaphone,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminContext } from '../context/AdminContext';
import {
  adminApi,
  apiGetSystemSettings,
  apiUpdateSystemSetting,
} from '../utils/adminApi';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  type: string;
  active: boolean;
  createdAt: string;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function dateText(value: unknown): string {
  if (!value) return '—';

  const d = new Date(String(value));

  if (Number.isNaN(d.getTime())) {
    return String(value);
  }

  return d.toLocaleString('en-NG');
}

function normalizeAnnouncement(
  raw: Record<string, unknown>,
): AnnouncementItem {
  return {
    id: text(raw.id),
    title: text(raw.title),
    body: text(
      raw.message ??
        raw.body,
    ),
    type: text(raw.type, 'info'),
    active:
      raw.active === true ||
      raw.active === 'true',
    createdAt: text(
      raw.createdAt ??
        raw.created_at,
    ),
  };
}

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function AdminNotifications() {
  const { isSuperAdmin } = useAdminContext();

  const [announcements, setAnnouncements] =
    useState<AnnouncementItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [showCompose, setShowCompose] =
    useState(false);

  const [title, setTitle] =
    useState('');

  const [body, setBody] =
    useState('');

  const [sending, setSending] =
    useState(false);

  const [banner, setBanner] =
    useState('');

  const [savingBanner, setSavingBanner] =
    useState(false);

  const loadAnnouncements =
    async () => {
      try {
        setLoading(true);

        const response =
          await adminApi(
            '/api/admin/announcements',
          );

        const payload =
          await readJson<{
            announcements?: unknown[];
            error?: string;
          }>(response);

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              'Failed to load announcements.',
          );
        }

        const rows =
          Array.isArray(
            payload?.announcements,
          )
            ? payload.announcements
            : [];

        setAnnouncements(
          rows
            .filter(
              (
                item,
              ): item is Record<
                string,
                unknown
              > =>
                Boolean(
                  item &&
                    typeof item ===
                      'object',
                ),
            )
            .map(
              normalizeAnnouncement,
            ),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to load announcements.',
        );
      } finally {
        setLoading(false);
      }
    };

  const loadBanner =
    async () => {
      try {
        const result =
          await apiGetSystemSettings();

        const value =
          result.settings?.system_announcement;

        setBanner(
          value == null
            ? ''
            : String(value),
        );
      } catch {
        setBanner('');
      }
    };

  useEffect(() => {
    void loadAnnouncements();
    void loadBanner();
  }, []);

  const createAnnouncement =
    async (
      active: boolean,
    ) => {
      if (!title.trim()) {
        toast.error('Title is required.');
        return;
      }

      if (!body.trim()) {
        toast.error('Message is required.');
        return;
      }

      setSending(true);

      try {
        const response =
          await adminApi(
            '/api/admin/announcements',
            {
              method: 'POST',
              body: JSON.stringify({
                title: title.trim(),
                message: body.trim(),
                type: 'info',
                active,
              }),
            },
          );

        const payload =
          await readJson<{
            announcement?: Record<
              string,
              unknown
            >;
            error?: string;
          }>(response);

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              'Failed to create announcement.',
          );
        }

        if (
          active
        ) {
          const broadcast =
            await adminApi(
              '/api/admin/notifications/broadcast',
              {
                method: 'POST',
                body: JSON.stringify({
                  title: title.trim(),
                  body: body.trim(),
                }),
              },
            );

          const broadcastPayload =
            await readJson<{
              sent?: number;
              error?: string;
            }>(broadcast);

          if (!broadcast.ok) {
            throw new Error(
              broadcastPayload?.error ??
                'Announcement saved but broadcast failed.',
            );
          }

          toast.success(
            `Announcement sent to ${Number(
              broadcastPayload?.sent ?? 0,
            ).toLocaleString()} users.`,
          );
        } else {
          toast.success('Announcement saved as draft.');
        }

        setTitle('');
        setBody('');
        setShowCompose(false);

        await loadAnnouncements();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to create announcement.',
        );
      } finally {
        setSending(false);
      }
    };

  const deleteAnnouncement =
    async (
      id: string,
    ) => {
      if (
        !window.confirm(
          'Delete this announcement?',
        )
      ) {
        return;
      }

      try {
        const response =
          await adminApi(
            `/api/admin/announcements/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'DELETE',
            },
          );

        const payload =
          await readJson<{
            error?: string;
          }>(response);

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              'Failed to delete announcement.',
          );
        }

        setAnnouncements(
          current =>
            current.filter(
              item =>
                item.id !== id,
            ),
        );

        toast.success(
          'Announcement deleted.',
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to delete announcement.',
        );
      }
    };

  const saveBanner =
    async () => {
      setSavingBanner(true);

      try {
        await apiUpdateSystemSetting(
          'system_announcement',
          banner.trim(),
        );

        toast.success(
          'System announcement banner saved.',
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to save banner.',
        );
      } finally {
        setSavingBanner(false);
      }
    };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-400">
            Super Admin access required.
          </p>
        </div>
      </div>
    );
  }

  const sentCount =
    announcements.filter(
      item => item.active,
    ).length;

  const draftCount =
    announcements.length -
    sentCount;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">
            Announcements
          </h1>

          <p className="mt-1 text-xs text-white/35">
            {sentCount} sent · {draftCount} draft
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowCompose(true)
          }
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New Announcement
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0B1B35] p-4 text-center">
          <Bell className="mx-auto mb-2 h-5 w-5 text-blue-400" />
          <p className="text-xl font-bold text-white">
            {announcements.length}
          </p>
          <p className="mt-1 text-xs text-white/35">
            Total
          </p>
        </div>

        <div className="rounded-2xl border border-green-500/15 bg-[#0B1B35] p-4 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-green-400" />
          <p className="text-xl font-bold text-green-400">
            {sentCount}
          </p>
          <p className="mt-1 text-xs text-white/35">
            Sent
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0B1B35] p-4 text-center">
          <FileText className="mx-auto mb-2 h-5 w-5 text-white/40" />
          <p className="text-xl font-bold text-white/60">
            {draftCount}
          </p>
          <p className="mt-1 text-xs text-white/35">
            Drafts
          </p>
        </div>
      </div>

      {showCompose ? (
        <div className="rounded-2xl border border-primary/20 bg-[#0B1B35] p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Create Announcement
              </h2>
              <p className="mt-1 text-[11px] text-white/30">
                Send a real notification and save it in the database.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowCompose(false)
              }
              className="rounded-lg bg-white/5 p-2 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <input
              value={title}
              onChange={e =>
                setTitle(e.target.value)
              }
              placeholder="Announcement title"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-primary/50"
            />

            <textarea
              value={body}
              onChange={e =>
                setBody(e.target.value)
              }
              rows={5}
              placeholder="Write announcement message..."
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-primary/50"
            />

            <div className="flex gap-3">
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  void createAnnouncement(
                    false,
                  )
                }
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/70 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                Save Draft
              </button>

              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  void createAnnouncement(
                    true,
                  )
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {sending
                  ? 'Sending...'
                  : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0B1B35] p-10 text-center text-xs text-white/30">
            Loading announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0B1B35] p-10 text-center">
            <Megaphone className="mx-auto mb-3 h-8 w-8 text-white/10" />
            <p className="text-sm text-white/40">
              No announcements yet.
            </p>
          </div>
        ) : (
          announcements.map(
            announcement => (
              <div
                key={announcement.id}
                className="rounded-2xl border border-white/[0.07] bg-[#0B1B35] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                      <Megaphone className="h-4 w-4 text-blue-400" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">
                        {announcement.title}
                      </h3>

                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-white/50">
                        {announcement.body}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                        announcement.active
                          ? 'border-green-500/20 bg-green-500/10 text-green-400'
                          : 'border-white/10 bg-white/5 text-white/40'
                      }`}
                    >
                      {announcement.active
                        ? 'Sent'
                        : 'Draft'}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        void deleteAnnouncement(
                          announcement.id,
                        )
                      }
                      className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/[0.05] pt-3 text-[10px] text-white/25">
                  {dateText(
                    announcement.createdAt,
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      <div className="rounded-2xl border border-amber-500/15 bg-[#0B1B35] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">
              System Announcement Banner
            </h2>
            <p className="mt-0.5 text-[10px] text-white/30">
              This banner is shown on the user homepage.
            </p>
          </div>
        </div>

        <textarea
          value={banner}
          onChange={e =>
            setBanner(e.target.value)
          }
          maxLength={280}
          rows={3}
          placeholder="Enter banner message..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-white/30">
            {banner.length}/280
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setBanner('')
              }
              className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() =>
                void saveBanner()
              }
              disabled={savingBanner}
              className="rounded-xl bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-400 disabled:opacity-40"
            >
              {savingBanner
                ? 'Saving...'
                : 'Save Banner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
