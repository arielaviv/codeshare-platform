/**
 * Per-app AI chat widget: lifecycle + rate limiting.
 *
 * The generated app calls a Mr8-owned proxy with a widget-specific JWT;
 * the widget JWT never authorizes anything besides proxying Anthropic
 * messages, and is scoped to a single widgetId with per-day and
 * per-month budget caps.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { AppChatWidget, type IAppChatWidget } from '../models/AppChatWidget';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const DAILY_REQUEST_CAP = 30;
const MONTHLY_CAP_CENTS = (() => {
  const raw = process.env.MR8_APP_CHAT_MONTHLY_CAP_CENTS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
})();

interface WidgetJwtPayload {
  widgetId: string;
  userId: string;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CreatedWidget {
  widgetId: string;
  jwt: string;
  proxyUrl: string;
}

export async function createWidget(
  userId: mongoose.Types.ObjectId,
  projectName: string
): Promise<CreatedWidget> {
  const widgetId = `wgt_${crypto.randomBytes(10).toString('hex')}`;
  const token = jwt.sign(
    { widgetId, userId: userId.toString() } as WidgetJwtPayload,
    JWT_SECRET,
    { expiresIn: '365d' }
  );
  await AppChatWidget.create({
    widgetId,
    userId,
    projectName,
    jwt: token,
    usageMonth: currentMonth(),
    usageDay: currentDay(),
  });
  const proxyBase = process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:5000';
  return {
    widgetId,
    jwt: token,
    proxyUrl: `${proxyBase}/api/app-chat/${widgetId}`,
  };
}

export function verifyWidgetJwt(token: string): WidgetJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as WidgetJwtPayload;
  } catch {
    return null;
  }
}

export type ChargeResult =
  | { ok: true; widget: IAppChatWidget }
  | { ok: false; reason: 'not-found' | 'daily-cap' | 'monthly-cap' };

/**
 * Rolls the monthly/daily counters, checks caps, and reserves a
 * request. Caller must settle the actual cost via `recordCostCents`.
 */
export async function reserveRequest(widgetId: string): Promise<ChargeResult> {
  const widget = await AppChatWidget.findOne({ widgetId });
  if (!widget) return { ok: false, reason: 'not-found' };

  const month = currentMonth();
  const day = currentDay();
  if (widget.usageMonth !== month) {
    widget.usageMonth = month;
    widget.monthlyCostCents = 0;
  }
  if (widget.usageDay !== day) {
    widget.usageDay = day;
    widget.dailyRequests = 0;
  }
  if (widget.dailyRequests >= DAILY_REQUEST_CAP) {
    return { ok: false, reason: 'daily-cap' };
  }
  if (widget.monthlyCostCents >= MONTHLY_CAP_CENTS) {
    return { ok: false, reason: 'monthly-cap' };
  }
  widget.dailyRequests += 1;
  widget.lastUsedAt = new Date();
  await widget.save();
  return { ok: true, widget };
}

export async function recordCostCents(widgetId: string, cents: number): Promise<void> {
  if (cents <= 0) return;
  await AppChatWidget.updateOne(
    { widgetId },
    { $inc: { monthlyCostCents: Math.ceil(cents) } }
  );
}

export const APP_CHAT_LIMITS = { DAILY_REQUEST_CAP, MONTHLY_CAP_CENTS };
