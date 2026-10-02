import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import {
  db,
} from '@workspace/db';

import {
  sql,
} from 'drizzle-orm';

const router =
  Router();

function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error:
        'Admin authentication required.',
    });
    return;
  }

  if (
    req.session.adminRole !==
    'super_admin'
  ) {
    res.status(403).json({
      error:
        'Super admin access required.',
    });
    return;
  }

  next();
}

router.use(
  requireSuperAdmin,
);

function text(
  value: unknown,
  fallback = '',
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function booleanValue(
  value: unknown,
  fallback = true,
): boolean {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (
    typeof value === 'string'
  ) {
    return (
      value.toLowerCase() ===
      'true'
    );
  }

  return Boolean(value);
}

function mapAnnouncement(
  row: Record<
    string,
    unknown
  >,
) {
  const enabled =
    Boolean(
      row.enabled ??
        true,
    );

  const body =
    text(
      row.body,
    );

  return {
    id: text(
      row.id,
    ),

    title: text(
      row.title,
    ),

    body,

    message: body,

    type: 'info',

    enabled,

    active: enabled,

    createdBy:
      row.created_by
        ? text(
            row.created_by,
          )
        : null,

    createdAt: text(
      row.created_at,
    ),

    updatedAt: text(
      row.updated_at,
    ),
  };
}

router.get(
  '/announcements',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            title,
            body,
            enabled,
            created_by,
            created_at,
            updated_at
          FROM announcements
          ORDER BY
            created_at DESC
        `);

      res.json({
        ok: true,

        announcements:
          result.rows.map(
            (
              row,
            ) =>
              mapAnnouncement(
                row as Record<
                  string,
                  unknown
                >,
              ),
          ),
      });
    } catch {
      res.status(500).json({
        error:
          'Failed to load announcements.',
      });
    }
  },
);

router.post(
  '/announcements',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const title =
      text(
        req.body?.title,
      ).trim();

    const body =
      text(
        req.body?.body ??
          req.body?.message,
      ).trim();

    const enabled =
      booleanValue(
        req.body?.enabled ??
          req.body?.active,
        true,
      );

    if (
      !title ||
      !body
    ) {
      res.status(400).json({
        error:
          'Title and message are required.',
      });

      return;
    }

    try {
      const result =
        await db.execute(sql`
          INSERT INTO announcements
            (
              title,
              body,
              enabled,
              created_by,
              created_at,
              updated_at
            )
          VALUES
            (
              ${title},
              ${body},
              ${enabled},
              ${req.session.adminId ?? null},
              NOW(),
              NOW()
            )
          RETURNING
            id,
            title,
            body,
            enabled,
            created_by,
            created_at,
            updated_at
        `);

      const row =
        result.rows[0] as Record<
          string,
          unknown
        >;

      res.status(201).json({
        ok: true,
        announcement:
          mapAnnouncement(
            row,
          ),
      });
    } catch {
      res.status(500).json({
        error:
          'Failed to create announcement.',
      });
    }
  },
);

router.patch(
  '/announcements/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const id =
      text(
        req.params.id,
      ).trim();

    const hasTitle =
      typeof req.body?.title ===
      'string';

    const hasBody =
      typeof req.body?.body ===
        'string' ||
      typeof req.body?.message ===
        'string';

    const hasEnabled =
      req.body?.enabled !==
        undefined ||
      req.body?.active !==
        undefined;

    const title =
      hasTitle
        ? text(
            req.body.title,
          ).trim()
        : null;

    const body =
      hasBody
        ? text(
            req.body.body ??
              req.body.message,
          ).trim()
        : null;

    const enabled =
      hasEnabled
        ? booleanValue(
            req.body.enabled ??
              req.body.active,
          )
        : null;

    if (!id) {
      res.status(400).json({
        error:
          'Announcement id is required.',
      });

      return;
    }

    try {
      const result =
        await db.execute(sql`
          UPDATE announcements
          SET
            title =
              COALESCE(
                ${title},
                title
              ),

            body =
              COALESCE(
                ${body},
                body
              ),

            enabled =
              COALESCE(
                ${enabled},
                enabled
              ),

            updated_at =
              NOW()

          WHERE id =
            ${id}

          RETURNING
            id,
            title,
            body,
            enabled,
            created_by,
            created_at,
            updated_at
        `);

      if (
        result.rows.length ===
        0
      ) {
        res.status(404).json({
          error:
            'Announcement not found.',
        });

        return;
      }

      const row =
        result.rows[0] as Record<
          string,
          unknown
        >;

      res.json({
        ok: true,
        announcement:
          mapAnnouncement(
            row,
          ),
      });
    } catch {
      res.status(500).json({
        error:
          'Failed to update announcement.',
      });
    }
  },
);

router.delete(
  '/announcements/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const id =
      text(
        req.params.id,
      ).trim();

    if (!id) {
      res.status(400).json({
        error:
          'Announcement id is required.',
      });

      return;
    }

    try {
      const result =
        await db.execute(sql`
          DELETE FROM announcements
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (
        result.rows.length ===
        0
      ) {
        res.status(404).json({
          error:
            'Announcement not found.',
        });

        return;
      }

      res.json({
        ok: true,
        id,
      });
    } catch {
      res.status(500).json({
        error:
          'Failed to delete announcement.',
      });
    }
  },
);

export default router;
