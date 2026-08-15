/**
 * Outbound notification channels.
 *
 * Configured entirely through environment variables so no paid provider is
 * required for local development:
 *
 *   NOTIFY_WEBHOOK_URL   POST a JSON payload (works with n8n, Make, WhatsApp
 *                        gateways, Slack-compatible receivers, …)
 *   NOTIFY_LOG=1         write the payload to the log instead (default in dev)
 *
 * Delivery is best-effort: a failing channel is logged and ignored.
 */

import { logger } from "./logger";

export interface OutboundMessage {
  to: string;
  name: string;
  type: string;
  title: string;
  body: string;
}

const WEBHOOK_TIMEOUT_MS = 5_000;

export async function dispatchOutbound(message: OutboundMessage): Promise<void> {
  const webhookUrl = process.env["NOTIFY_WEBHOOK_URL"];

  if (!webhookUrl) {
    if (process.env["NODE_ENV"] !== "production" || process.env["NOTIFY_LOG"]) {
      logger.info({ notification: message }, "[notify] outbound (no channel configured)");
    }
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "[notify] webhook rejected the notification",
      );
    }
  } catch (err) {
    logger.error({ err }, "[notify] webhook delivery failed");
  } finally {
    clearTimeout(timer);
  }
}
