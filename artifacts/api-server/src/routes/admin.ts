/**
 * Admin routes — complete file
 */

import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/database.js';
import {
  adminAccountsTable,
  adminLoginHistoryTable,
  adminSessionsTable,
  type InsertAdminAccount,
} from '@gy-data-hub/db';
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

/**
 * Ensure the bootstrap super admin exists and
 * ALWAYS synchronizes its PIN, role and status.
 */
export async function ensureSuperAdmin(): Promise<void> {
  if (
    !BOOTSTRAP_EMAIL ||
    BOOTSTRAP_PIN.length < MIN_BOOTSTRAP_PIN_LENGTH
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
      eq(
        adminAccountsTable.email,
        BOOTSTRAP_EMAIL,
      ),
    )
    .limit(1);

  const pinHash = await hashPin(
    BOOTSTRAP_PIN,
  );

  if (existing.length > 0) {
    const existingAdmin = existing[0];

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
 */
router.post(
  '/login',
  async (req, res) => {
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

      if (!email || !pin) {
        return res.status(400).json({
          success: false,
          message:
            'Email and PIN are required.',
        });
      }

      const [admin] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.email,
            email,
          ),
        )
        .limit(1);

      if (!admin) {
        logger.warn(
          {
            email,
          },
          'Admin login failed: account not found',
        );

        return res.status(401).json({
          success: false,
          message:
            'Invalid admin credentials.',
        });
      }

      if (admin.status !== 'active') {
        logger.warn(
          {
            email,
            status: admin.status,
          },
          'Admin login failed: account disabled',
        );

        return res.status(403).json({
          success: false,
          message:
            'Admin account is disabled.',
        });
      }

      const valid = await verifyPin(
        pin,
        admin.pinHash,
      );

      if (!valid) {
        logger.warn(
          {
            email,
            adminId: admin.id,
          },
          'Admin login failed: invalid PIN',
        );

        return res.status(401).json({
          success: false,
          message:
            'Invalid admin credentials.',
        });
      }

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail =
        admin.email;
      req.session.adminRole =
        admin.role;

      await db
        .update(adminAccountsTable)
        .set({
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            admin.id,
          ),
        );

      try {
        await db
          .insert(adminLoginHistoryTable)
          .values({
            adminId: admin.id,
            email: admin.email,
            success: true,
            ipAddress:
              req.ip ?? null,
            userAgent:
              req.get('user-agent') ??
              null,
          });
      } catch (historyError) {
        logger.warn(
          {
            err: historyError,
            adminId: admin.id,
          },
          'Failed to record admin login history',
        );
      }

      logger.info(
        {
          email: admin.email,
          adminId: admin.id,
          role: admin.role,
        },
        'Admin login successful',
      );

      return res.json({
        success: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
        },
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Admin login error',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to process admin login.',
      });
    }
  },
);

/**
 * GET /api/admin/me
 */
router.get(
  '/me',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [admin] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            req.session.adminId,
          ),
        )
        .limit(1);

      if (!admin) {
        req.session.isAdmin = false;
        req.session.adminId = undefined;
        req.session.adminEmail =
          undefined;
        req.session.adminRole =
          undefined;

        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (admin.status !== 'active') {
        req.session.isAdmin = false;
        req.session.adminId = undefined;
        req.session.adminEmail =
          undefined;
        req.session.adminRole =
          undefined;

        return res.status(403).json({
          success: false,
          message:
            'Admin account is disabled.',
        });
      }

      return res.json({
        success: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
          financePermissions:
            admin.financePermissions ??
            [],
          lastLoginAt:
            admin.lastLoginAt,
          createdAt:
            admin.createdAt,
          updatedAt:
            admin.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to load current admin',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load admin profile.',
      });
    }
  },
);

/**
 * POST /api/admin/logout
 */
router.post(
  '/logout',
  async (req, res) => {
    try {
      const adminId =
        req.session.adminId;

      if (adminId) {
        try {
          await db
            .update(adminSessionsTable)
            .set({
              revokedAt: new Date(),
            })
            .where(
              and(
                eq(
                  adminSessionsTable.adminId,
                  adminId,
                ),
                eq(
                  adminSessionsTable.revokedAt,
                  null,
                ),
              ),
            );
        } catch (sessionError) {
          logger.warn(
            {
              err: sessionError,
              adminId,
            },
            'Failed to revoke admin sessions',
          );
        }
      }

      req.session.isAdmin = false;
      req.session.adminId = undefined;
      req.session.adminEmail =
        undefined;
      req.session.adminRole =
        undefined;

      req.session.destroy(
        (destroyError) => {
          if (destroyError) {
            logger.warn(
              {
                err: destroyError,
              },
              'Failed to destroy admin session',
            );
          }

          return res.json({
            success: true,
          });
        },
      );
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Admin logout error',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to logout admin.',
      });
    }
  },
);

/**
 * GET /api/admin/accounts
 */
router.get(
  '/accounts',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (
        currentAdmin.role !==
        'super_admin'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Super admin permission required.',
        });
      }

      const accounts = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          financePermissions:
            adminAccountsTable.financePermissions,
          createdBy:
            adminAccountsTable.createdBy,
          lastLoginAt:
            adminAccountsTable.lastLoginAt,
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
        })
        .from(adminAccountsTable)
        .orderBy(
          desc(
            adminAccountsTable.createdAt,
          ),
        );

      return res.json({
        success: true,
        accounts,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to load admin accounts',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load admin accounts.',
      });
    }
  },
);

/**
 * POST /api/admin/accounts
 */
router.post(
  '/accounts',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (
        currentAdmin.role !==
        'super_admin'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Super admin permission required.',
        });
      }

      const name =
        typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : '';

      const email =
        typeof req.body?.email === 'string'
          ? req.body.email
              .trim()
              .toLowerCase()
          : '';

      const role =
        typeof req.body?.role === 'string'
          ? req.body.role
          : 'admin';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      const financePermissions =
        Array.isArray(
          req.body?.financePermissions,
        )
          ? req.body.financePermissions.filter(
              (value: unknown) =>
                typeof value ===
                'string',
            )
          : [];

      if (!name || !email || !pin) {
        return res.status(400).json({
          success: false,
          message:
            'Name, email and PIN are required.',
        });
      }

      const allowedRoles = [
        'super_admin',
        'admin',
        'customer_care',
        'finance',
        'supervisor',
        'technical_support',
      ] as const;

      if (
        !allowedRoles.includes(
          role as (typeof allowedRoles)[number],
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid admin role.',
        });
      }

      if (pin.length < 4) {
        return res.status(400).json({
          success: false,
          message:
            'PIN must contain at least 4 characters.',
        });
      }

      const [existing] = await db
        .select({
          id: adminAccountsTable.id,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.email,
            email,
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(409).json({
          success: false,
          message:
            'An admin account with this email already exists.',
        });
      }

      const pinHash = await hashPin(
        pin,
      );

      const values: InsertAdminAccount = {
        name,
        email,
        pinHash,
        role: role as
          | 'super_admin'
          | 'admin'
          | 'customer_care'
          | 'finance'
          | 'supervisor'
          | 'technical_support',
        status: 'active',
        financePermissions,
        createdBy:
          currentAdmin.id,
      };

      const [created] =
        await db
          .insert(adminAccountsTable)
          .values(values)
          .returning({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role: adminAccountsTable.role,
            status:
              adminAccountsTable.status,
            financePermissions:
              adminAccountsTable.financePermissions,
            createdBy:
              adminAccountsTable.createdBy,
            createdAt:
              adminAccountsTable.createdAt,
            updatedAt:
              adminAccountsTable.updatedAt,
          });

      return res.status(201).json({
        success: true,
        admin: created,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to create admin account',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to create admin account.',
      });
    }
  },
);

/**
 * PATCH /api/admin/accounts/:id
 */
router.patch(
  '/accounts/:id',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (
        currentAdmin.role !==
        'super_admin'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Super admin permission required.',
        });
      }

      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            'Admin ID is required.',
        });
      }

      const [target] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .limit(1);

      if (!target) {
        return res.status(404).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      const updates: Record<
        string,
        unknown
      > = {
        updatedAt: new Date(),
      };

      if (
        typeof req.body?.name ===
        'string'
      ) {
        const name =
          req.body.name.trim();

        if (name) {
          updates.name = name;
        }
      }

      if (
        typeof req.body?.email ===
        'string'
      ) {
        const email =
          req.body.email
            .trim()
            .toLowerCase();

        if (email) {
          const [emailOwner] =
            await db
              .select({
                id: adminAccountsTable.id,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.email,
                  email,
                ),
              )
              .limit(1);

          if (
            emailOwner &&
            emailOwner.id !== id
          ) {
            return res.status(409).json({
              success: false,
              message:
                'Another admin already uses this email.',
            });
          }

          updates.email = email;
        }
      }

      if (
        typeof req.body?.role ===
        'string'
      ) {
        const allowedRoles = [
          'super_admin',
          'admin',
          'customer_care',
          'finance',
          'supervisor',
          'technical_support',
        ];

        if (
          !allowedRoles.includes(
            req.body.role,
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid admin role.',
          });
        }

        updates.role =
          req.body.role;
      }

      if (
        typeof req.body?.status ===
        'string'
      ) {
        if (
          !['active', 'disabled'].includes(
            req.body.status,
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid admin status.',
          });
        }

        if (
          id ===
            currentAdmin.id &&
          req.body.status ===
            'disabled'
        ) {
          return res.status(400).json({
            success: false,
            message:
              'You cannot disable your own account.',
          });
        }

        updates.status =
          req.body.status;
      }

      if (
        Array.isArray(
          req.body?.financePermissions,
        )
      ) {
        updates.financePermissions =
          req.body.financePermissions.filter(
            (value: unknown) =>
              typeof value ===
              'string',
          );
      }

      if (
        typeof req.body?.pin ===
        'string'
      ) {
        const pin =
          req.body.pin.trim();

        if (pin.length < 4) {
          return res.status(400).json({
            success: false,
            message:
              'PIN must contain at least 4 characters.',
          });
        }

        updates.pinHash =
          await hashPin(pin);
      }

      const [updated] =
        await db
          .update(adminAccountsTable)
          .set(
            updates as Partial<
              typeof adminAccountsTable.$inferInsert
            >,
          )
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .returning({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role: adminAccountsTable.role,
            status:
              adminAccountsTable.status,
            financePermissions:
              adminAccountsTable.financePermissions,
            createdBy:
              adminAccountsTable.createdBy,
            lastLoginAt:
              adminAccountsTable.lastLoginAt,
            createdAt:
              adminAccountsTable.createdAt,
            updatedAt:
              adminAccountsTable.updatedAt,
          });

      return res.json({
        success: true,
        admin: updated,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to update admin account',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to update admin account.',
      });
    }
  },
);

/**
 * DELETE /api/admin/accounts/:id
 */
router.delete(
  '/accounts/:id',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (
        currentAdmin.role !==
        'super_admin'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Super admin permission required.',
        });
      }

      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message:
            'Admin ID is required.',
        });
      }

      if (
        id ===
        currentAdmin.id
      ) {
        return res.status(400).json({
          success: false,
          message:
            'You cannot delete your own account.',
        });
      }

      const [target] =
        await db
          .select({
            id: adminAccountsTable.id,
            email:
              adminAccountsTable.email,
          })
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      if (!target) {
        return res.status(404).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      await db
        .delete(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      return res.json({
        success: true,
        message:
          'Admin account deleted successfully.',
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to delete admin account',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to delete admin account.',
      });
    }
  },
);

/**
 * GET /api/admin/login-history
 */
router.get(
  '/login-history',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      const limitValue =
        Number(req.query.limit);

      const limit =
        Number.isFinite(
          limitValue,
        ) &&
        limitValue > 0
          ? Math.min(
              Math.floor(
                limitValue,
              ),
              500,
            )
          : 100;

      const history =
        await db
          .select()
          .from(adminLoginHistoryTable)
          .orderBy(
            desc(
              adminLoginHistoryTable.createdAt,
            ),
          )
          .limit(limit);

      return res.json({
        success: true,
        history,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to load admin login history',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load login history.',
      });
    }
  },
);

/**
 * POST /api/admin/change-pin
 */
router.post(
  '/change-pin',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const currentPin =
        typeof req.body?.currentPin ===
        'string'
          ? req.body.currentPin.trim()
          : '';

      const newPin =
        typeof req.body?.newPin ===
        'string'
          ? req.body.newPin.trim()
          : '';

      if (
        !currentPin ||
        !newPin
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Current PIN and new PIN are required.',
        });
      }

      if (newPin.length < 4) {
        return res.status(400).json({
          success: false,
          message:
            'New PIN must contain at least 4 characters.',
        });
      }

      const [admin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!admin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      const valid =
        await verifyPin(
          currentPin,
          admin.pinHash,
        );

      if (!valid) {
        return res.status(401).json({
          success: false,
          message:
            'Current PIN is incorrect.',
        });
      }

      const pinHash =
        await hashPin(newPin);

      await db
        .update(adminAccountsTable)
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            admin.id,
          ),
        );

      return res.json({
        success: true,
        message:
          'PIN changed successfully.',
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to change admin PIN',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to change admin PIN.',
      });
    }
  },
);

/**
 * POST /api/admin/accounts/:id/reset-pin
 */
router.post(
  '/accounts/:id/reset-pin',
  async (req, res) => {
    try {
      if (
        !req.session.isAdmin ||
        !req.session.adminId
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Admin authentication required.',
        });
      }

      const [currentAdmin] =
        await db
          .select()
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              req.session.adminId,
            ),
          )
          .limit(1);

      if (!currentAdmin) {
        return res.status(401).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      if (
        currentAdmin.role !==
        'super_admin'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Super admin permission required.',
        });
      }

      const id = req.params.id;

      const pin =
        typeof req.body?.pin ===
        'string'
          ? req.body.pin.trim()
          : '';

      if (!id || !pin) {
        return res.status(400).json({
          success: false,
          message:
            'Admin ID and new PIN are required.',
        });
      }

      if (pin.length < 4) {
        return res.status(400).json({
          success: false,
          message:
            'PIN must contain at least 4 characters.',
        });
      }

      const [target] =
        await db
          .select({
            id: adminAccountsTable.id,
          })
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      if (!target) {
        return res.status(404).json({
          success: false,
          message:
            'Admin account not found.',
        });
      }

      const pinHash =
        await hashPin(pin);

      await db
        .update(adminAccountsTable)
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      return res.json({
        success: true,
        message:
          'Admin PIN reset successfully.',
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'Failed to reset admin PIN',
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to reset admin PIN.',
      });
    }
  },
);

export default router;
