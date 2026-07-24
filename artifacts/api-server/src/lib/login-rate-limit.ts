import type { Request } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_TRACKED_KEYS = 10_000;

type AttemptBucket = {
  failures: number;
  reservations: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptBucket>();

export type LoginAttemptReservation = {
  entries: Array<{ key: string; bucket: AttemptBucket }>;
  settled: boolean;
};

function normalizedEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
}

function keysFor(req: Request, email: unknown) {
  const keys = [`ip:${req.ip || req.socket.remoteAddress || "unknown"}`];
  const emailKey = normalizedEmail(email);
  if (emailKey) keys.push(`email:${emailKey}`);
  return keys;
}

function limitFor(key: string) {
  return key.startsWith("email:") ? MAX_FAILURES_PER_EMAIL : MAX_FAILURES_PER_IP;
}

function getActiveBucket(key: string, now: number) {
  const bucket = attempts.get(key);
  if (bucket && bucket.resetAt <= now) {
    attempts.delete(key);
    return undefined;
  }
  return bucket;
}

function pruneExpired(now: number) {
  for (const [key, bucket] of attempts) {
    if (bucket.resetAt <= now) attempts.delete(key);
  }
}

export function reserveLoginAttempt(req: Request, email: unknown):
  | { limited: true; retryAfterSeconds: number }
  | { limited: false; reservation: LoginAttemptReservation } {
  const now = Date.now();
  let retryAfterMs = 0;
  const keys = keysFor(req, email);
  const activeBuckets = new Map<string, AttemptBucket>();

  for (const key of keys) {
    const bucket = getActiveBucket(key, now);
    if (bucket) activeBuckets.set(key, bucket);
    if (bucket && bucket.failures + bucket.reservations >= limitFor(key)) {
      retryAfterMs = Math.max(retryAfterMs, bucket.resetAt - now);
    }
  }

  if (retryAfterMs > 0) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  const missingBuckets = keys.filter((key) => !activeBuckets.has(key)).length;
  if (attempts.size + missingBuckets > MAX_TRACKED_KEYS) {
    pruneExpired(now);
  }
  if (attempts.size + missingBuckets > MAX_TRACKED_KEYS) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil(WINDOW_MS / 1000),
    };
  }

  const entries = keys.map((key) => {
    const bucket = activeBuckets.get(key);
    if (bucket) {
      bucket.reservations += 1;
      return { key, bucket };
    }

    const newBucket = { failures: 0, reservations: 1, resetAt: now + WINDOW_MS };
    attempts.set(key, newBucket);
    return { key, bucket: newBucket };
  });

  return {
    limited: false,
    reservation: { entries, settled: false },
  };
}

function settleLoginAttempt(
  reservation: LoginAttemptReservation,
  outcome: "failure" | "success" | "rollback",
) {
  if (reservation.settled) return;
  reservation.settled = true;

  for (const { key, bucket } of reservation.entries) {
    if (attempts.get(key) !== bucket) continue;

    bucket.reservations = Math.max(0, bucket.reservations - 1);
    if (outcome === "failure") {
      bucket.failures += 1;
    } else if (outcome === "success" && key.startsWith("email:")) {
      bucket.failures = 0;
    }

    if (bucket.failures === 0 && bucket.reservations === 0) {
      attempts.delete(key);
    }
  }
}

export function commitLoginFailure(reservation: LoginAttemptReservation) {
  settleLoginAttempt(reservation, "failure");
}

export function completeLoginSuccess(reservation: LoginAttemptReservation) {
  settleLoginAttempt(reservation, "success");
}

export function rollbackLoginAttempt(reservation: LoginAttemptReservation) {
  settleLoginAttempt(reservation, "rollback");
}
