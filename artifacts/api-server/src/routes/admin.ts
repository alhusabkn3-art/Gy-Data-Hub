import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { db } from '@workspace/db';

import {
  usersTable,
  adminAccountsTable,
  adminAuditLogsTable,
  type InsertAdminAccount,
} from '@workspace/db/schema';

import { sql, eq } from 'drizzle-orm';

import {
  hashPin,
  verifyPin,
} from '../lib/auth.js';

import { logger } from '../lib/logger.js';

const router = Router();

const BOOTSTRAP_EMAIL = (
  process.env['ADMIN_EMAIL'] ?? 'sadmin@gyd.com'
)
  .trim()
  .toLowerCase();

const BOOTSTRAP_PIN = (
  process.env['ADMIN_PIN'] ?? '1251'
).trim();

const MIN_BOOTSTRAP_PIN_LENGTH = 4;

function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error: 'Admin authentication required.',
    });
    return;
  }

  next();
}

function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error: 'Admin authentication required.',
    });
    return;
  }

  if (req.session.adminRole !== 'super_admin') {
    res.status(403).json({
      error: 'Super Admin access required.',
    });
    return;
  }

  next();
}

function clientIp(
  req: Request,
): string | null {
  const forwarded =
    req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    return forwarded
      .split(',')[0]
      .trim();
  }

  if (
    Array.isArray(forwarded) &&
    forwarded.length > 0
  ) {
    return forwarded[0];
  }

  return req.ip ?? null;
}

async function auditLog(opts: {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId: opts.adminId,
      adminEmail: opts.adminEmail,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      targetLabel: opts.targetLabel ?? null,
      details: opts.details ?? null,
      ip: opts.ip ?? null,
    });
  } catch (err) {
    logger.error(
      { err },
      'Failed to write admin audit log',
    );
  }
}

/**
 * Bootstrap Super Admin
 *
 * ADMIN_EMAIL and ADMIN_PIN are the authoritative
 * credentials for the bootstrap Super Admin.
 */
export async function ensureSuperAdmin(): Promise<void> {
  if (
    !BOOTSTRAP_EMAIL ||
    BOOTSTRAP_PIN.length <
      MIN_BOOTSTRAP_PIN_LENGTH
  ) {
    throw new Error(
      'Invalid bootstrap super admin configuration.',
    );
  }

  const existing = await db
    .select({
      id: adminAccountsTable.id,
      email: adminAccountsTable.email,
      role: adminAccountsTable.role,
      status: adminAccountsTable.status,
    })
    .from(adminAccountsTable)
    .where(
      sql`LOWER(${adminAccountsTable.email}) = ${BOOTSTRAP_EMAIL}`,
    )
    .limit(1);

  const pinHash = await hashPin(
    BOOTSTRAP_PIN,
  );

  if (existing.length > 0) {
    const existingAdmin =
      existing[0];

    await db
      .update(adminAccountsTable)
      .set({
        pinHash,
        role: 'super_admin',
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        eq(
          adminAccountsTable.id,
          existingAdmin.id,
        ),
      );

    logger.info(
      {
        email: BOOTSTRAP_EMAIL,
      },
      'Bootstrap super admin synchronized',
    );

    return;
  }

  const values: InsertAdminAccount = {
    name: 'Super Admin',
    email: BOOTSTRAP_EMAIL,
    pinHash,
    role: 'super_admin',
    status: 'active',
  };

  await db
    .insert(adminAccountsTable)
    .values(values);

  logger.info(
    {
      email: BOOTSTRAP_EMAIL,
    },
    'Bootstrap super admin created',
  );
}

/**
 * POST /api/admin/login
 *
 * IMPORTANT:
 *
 * The login route is intentionally registered before every
 * authenticated admin route. No requireAdmin middleware is
 * attached to the router itself.
 *
 * For the bootstrap account, ADMIN_EMAIL + ADMIN_PIN are
 * authoritative. The database hash is synchronized on startup
 * and before bootstrap authentication.
 */
router.post(
  '/login',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email
              .trim()
              .toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      /*
       * Never expose the actual PIN in logs.
       * Log only lengths and whether the expected
       * bootstrap email was received.
       */
      logger.info(
        {
          requestEmail: email || '(empty)',
          bootstrapEmail:
            BOOTSTRAP_EMAIL || '(empty)',
          emailMatchesBootstrap:
            Boolean(
              email &&
                email ===
                  BOOTSTRAP_EMAIL,
            ),
          submittedPinLength:
            pin.length,
          configuredPinLength:
            BOOTSTRAP_PIN.length,
        },
        'Admin login request received',
      );

      if (!email || !pin) {
        logger.warn(
          {
            hasEmail: Boolean(email),
            hasPin: Boolean(pin),
          },
          'Admin login rejected: missing credentials',
        );

        res.status(400).json({
          error:
            'Email and PIN are required.',
        });
        return;
      }

      /*
       * ============================================================
       * BOOTSTRAP SUPER ADMIN
       * ============================================================
       */
      if (email === BOOTSTRAP_EMAIL) {
        if (
          BOOTSTRAP_PIN.length <
          MIN_BOOTSTRAP_PIN_LENGTH
        ) {
          logger.error(
            {
              email: BOOTSTRAP_EMAIL,
              configuredPinLength:
                BOOTSTRAP_PIN.length,
            },
            'Invalid bootstrap Super Admin configuration',
          );

          res.status(500).json({
            error:
              'Super Admin authentication is not configured correctly.',
          });
          return;
        }

        /*
         * Synchronize the account first.
         */
        await ensureSuperAdmin();

        /*
         * ADMIN_PIN is the source of truth.
         */
        if (pin !== BOOTSTRAP_PIN) {
          logger.warn(
            {
              email,
              submittedPinLength:
                pin.length,
              configuredPinLength:
                BOOTSTRAP_PIN.length,
            },
            'Admin login rejected: bootstrap PIN mismatch',
          );

          res.status(401).json({
            error: 'Invalid credentials.',
          });
          return;
        }

        /*
         * Fetch the synchronized account.
         */
        const result = await db
          .select({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email: adminAccountsTable.email,
            role: adminAccountsTable.role,
            status:
              adminAccountsTable.status,
          })
          .from(adminAccountsTable)
          .where(
            sql`LOWER(${adminAccountsTable.email}) = ${BOOTSTRAP_EMAIL}`,
          )
          .limit(1);

        const admin = result[0];

        if (!admin) {
          logger.error(
            {
              email:
                BOOTSTRAP_EMAIL,
            },
            'Bootstrap Super Admin account missing after synchronization',
          );

          res.status(500).json({
            error:
              'Super Admin account initialization failed.',
          });
          return;
        }

        if (
          admin.status !== 'active'
        ) {
          logger.error(
            {
              email: admin.email,
              status: admin.status,
            },
            'Bootstrap Super Admin account is not active',
          );

          res.status(403).json({
            error:
              'Super Admin account is not active.',
          });
          return;
        }

        /*
         * Force the authenticated session to Super Admin.
         */
        req.session.isAdmin = true;
        req.session.adminId = admin.id;
        req.session.adminEmail =
          admin.email;
        req.session.adminRole =
          'super_admin';

        /*
         * Persist the session before returning success.
         */
        await new Promise<void>(
          (resolve, reject) => {
            req.session.save(
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              },
            );
          },
        );

        await auditLog({
          adminId: admin.id,
          adminEmail: admin.email,
          action: 'admin_login',
          targetType: 'admin',
          targetId: admin.id,
          targetLabel: admin.email,
          ip: clientIp(req),
        });

        logger.info(
          {
            email: admin.email,
            role: 'super_admin',
          },
          'Bootstrap Super Admin login successful',
        );

        res.status(200).json({
          ok: true,
          admin: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: 'super_admin',
          },
        });

        return;
      }

      /*
       * ============================================================
       * NORMAL ADMIN
       * ============================================================
       */
      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          pinHash:
            adminAccountsTable.pinHash,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        })
        .from(adminAccountsTable)
        .where(
          sql`LOWER(${adminAccountsTable.email}) = ${email}`,
        )
        .limit(1);

      const admin = result[0];

      if (!admin) {
        logger.warn(
          {
            email,
          },
          'Admin login rejected: account not found',
        );

        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      if (
        admin.status !== 'active'
      ) {
        res.status(403).json({
          error:
            'Admin account is not active.',
        });
        return;
      }

      const valid =
        await verifyPin(
          pin,
          admin.pinHash,
        );

      if (!valid) {
        logger.warn(
          {
            email,
          },
          'Admin login rejected: invalid PIN',
        );

        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail =
        admin.email;
      req.session.adminRole =
        admin.role;

      await new Promise<void>(
        (resolve, reject) => {
          req.session.save(
            (err) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            },
          );
        },
      );

      await auditLog({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'admin_login',
        targetType: 'admin',
        targetId: admin.id,
        targetLabel: admin.email,
        ip: clientIp(req),
      });

      logger.info(
        {
          email: admin.email,
          role: admin.role,
        },
        'Admin login successful',
      );

      res.status(200).json({
        ok: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      logger.error(
        {
          err,
          requestEmail:
            typeof req.body?.email ===
            'string'
              ? req.body.email
                  .trim()
                  .toLowerCase()
              : '(empty)',
        },
        'admin/login failed',
      );

      res.status(500).json({
        error: 'Failed to login.',
      });
    }
  },
);

/*
 * POST /api/admin/logout
 */
router.post(
  '/logout',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const adminId =
        req.session.adminId;

      const adminEmail =
        req.session.adminEmail;

      if (
        adminId &&
        adminEmail
      ) {
        await auditLog({
          adminId,
          adminEmail,
          action: 'admin_logout',
          targetType: 'admin',
          targetId: adminId,
          targetLabel: adminEmail,
          ip: clientIp(req),
        });
      }

      await new Promise<void>(
        (resolve, reject) => {
          req.session.destroy(
            (err) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            },
          );
        },
      );

      res.clearCookie(
        'connect.sid',
      );

      res.status(200).json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/logout failed',
      );

      res.status(500).json({
        error: 'Failed to logout.',
      });
    }
  },
);

/*
 * GET /api/admin/me
 */
router.get(
  '/me',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const adminId =
        req.session.adminId;

      if (!adminId) {
        res.status(401).json({
          error:
            'Admin authentication required.',
        });
        return;
      }

      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
          lastLoginAt:
            adminAccountsTable.lastLoginAt,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            adminId,
          ),
        )
        .limit(1);

      const admin = result[0];

      if (!admin) {
        await new Promise<void>(
          (resolve) => {
            req.session.destroy(
              () => resolve(),
            );
          },
        );

        res.status(401).json({
          error:
            'Admin authentication required.',
        });
        return;
      }

      if (
        admin.status !== 'active'
      ) {
        await new Promise<void>(
          (resolve) => {
            req.session.destroy(
              () => resolve(),
            );
          },
        );

        res.status(403).json({
          error:
            'Admin account is not active.',
        });
        return;
      }

      res.status(200).json({
        ok: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          createdAt:
            admin.createdAt,
          lastLoginAt:
            admin.lastLoginAt,
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/me failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin session.',
      });
    }
  },
);

/*
 * The remainder of the existing admin management routes
 * should remain exactly as they are in your current
 * artifacts/api-server/src/routes/admin.ts file.
 */

export default router;
