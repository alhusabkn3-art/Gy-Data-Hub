import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const kycStatusEnum = pgEnum('kyc_status', ['unverified', 'pending', 'verified']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended', 'closed']);

export const usersTable = pgTable('users', {
  id:              uuid('id').primaryKey().defaultRandom(),
  name:            text('name').notNull(),
  firstName:       text('first_name').notNull(),
  lastName:        text('last_name').notNull().default(''),
  email:           text('email').notNull(),
  phone:           text('phone').notNull().unique(),
  loginPinHash:    text('login_pin_hash').notNull(),
  purchasePinHash: text('purchase_pin_hash'),           // nullable — set separately
  accountNumber:   text('account_number').notNull().unique(),
  bankName:        text('bank_name').notNull().default('GY DATA Wallet'),
  referralCode:    text('referral_code').notNull().unique(),
  kycStatus:       kycStatusEnum('kyc_status').notNull().default('unverified'),
  status:          accountStatusEnum('status').notNull().default('active'),
  resetOtpHash:    text('reset_otp_hash'),    // bcrypt hash of a pending PIN-reset OTP
  resetOtpExpiry:  timestamp('reset_otp_expiry'), // OTP expires after 5 minutes
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

export type DbUser     = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
