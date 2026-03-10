import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import cors from "cors";

type TokenBucketState = {
  tokens: number;
  lastRefillMs: number;
  lastSeenMs: number;
};

type TokenBucketOptions = {
  capacity: number;
  refillPerSecond: number;
  keyFn?: (req: Request) => string;
  costFn?: (req: Request) => number;
  cleanupIdleMs?: number;
};

type UpstreamTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  enqueuedAtMs: number;
};

type UpstreamLeakyBucketOptions = {
  leakRatePerSecond: number;
  maxQueueSize: number;
  maxConcurrent: number;
  maxQueueWaitMs: number;
};

type BusCodesBody = {
  busCodes: string[];
};

type AnnouncementJson = {
  HATKODU: string;
  HAT: string;
  TIP: "Günlük" | "Sefer" | string;
  GUNCELLEME_SAATI: string;
  MESAJ: string;
};

type AnnouncementInfo = {
  HATKODU: string;
  HAT: string;
  TIP: "Günlük" | "Sefer" | string;
  GUNCELLEME_SAATI: string;
  MESAJ: string;
};

type DepartureTimesJson = {
  SHATKODU: string;
  HATADI: string;
  SGUZERAH: string;
  SYON: string;
  SGUNTIPI: string;
  GUZERGAH_ISARETI: null | string;
  SSERVISTIPI: string;
  DT: string;
};

type DepartureTimeRemaining = {
  timeRemaining: string;
  secondTimeReamining: string;
};

type BusRoutesResponse = {
  ok: boolean;
  announcements: AnnouncementInfo[];
  times: Record<string, DepartureTimeRemaining>;
  errors: Record<string, Err["error"]>;
  summary: { total: number; success: number; failed: number };
};

type Ok<T> = { ok: true; busCode: string; data: T };
type Err = {
  ok: false;
  busCode: string;
  error: { message: string; status?: number; kind: string };
};
type Result<T> = Ok<T> | Err;

type IstanbulDatePart = "year" | "month" | "day" | "hour" | "minute" | "second";

const PORT = Number(process.env.PORT || 3000);
const ISTANBUL_TZ = "Europe/Istanbul";
const MAX_BUS_CODES = 5;
const SOAP_TIMEOUT_MS = 6000;
const ANNOUNCEMENTS_CACHE_TTL_MS = 30_000;
const TIMES_CACHE_TTL_MS = 15_000;

/**
 * Assumption:
 * I = Hafta içi
 * C = Cumartesi
 * P = Pazar
 */
type ServiceDayCode = "I" | "C" | "P";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

function isValidBusCodeFormat(value: string): boolean {
  // keep this practical; adjust if your upstream accepts other characters
  return /^[A-Z0-9._-]{1,20}$/.test(value);
}

function getDatePartNumber(
  parts: Intl.DateTimeFormatPart[],
  partType: IstanbulDatePart,
): number {
  const value = parts.find((part) => part.type === partType)?.value;
  if (!value) throw new Error(`Missing date part: ${partType}`);
  return Number(value);
}

function getIstanbulNow(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISTANBUL_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());

  return new Date(
    getDatePartNumber(parts, "year"),
    getDatePartNumber(parts, "month") - 1,
    getDatePartNumber(parts, "day"),
    getDatePartNumber(parts, "hour"),
    getDatePartNumber(parts, "minute"),
    getDatePartNumber(parts, "second"),
    0,
  );
}

function getIstanbulWeekday(now: Date): number {
  // 0 Sunday, 6 Saturday
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ISTANBUL_TZ,
      weekday: "numeric",
    }).format(now),
  ) % 7;
}

function getCurrentServiceDayCode(now: Date): ServiceDayCode {
  const day = now.getDay(); // works because `now` is already Istanbul-local constructed date
  if (day === 6) return "C";
  if (day === 0) return "P";
  return "I";
}

function formatTimeDifference(target: Date, now: Date): string {
  const diffMs = Math.max(0, target.getTime() - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function isAnnouncementJsonArray(x: unknown): x is AnnouncementJson[] {
  return (
    Array.isArray(x) &&
    x.every((item) =>
      isRecord(item) &&
      typeof item.HATKODU === "string" &&
      typeof item.HAT === "string" &&
      typeof item.TIP === "string" &&
      typeof item.GUNCELLEME_SAATI === "string" &&
      typeof item.MESAJ === "string"
    )
  );
}

function isDepartureTimeJson(value: unknown): value is DepartureTimesJson[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!isRecord(item)) return false;
      const dt = typeof item.DT === "string" ? item.DT.trim() : "";

      return (
        typeof item.SHATKODU === "string" &&
        typeof item.HATADI === "string" &&
        typeof item.SGUZERAH === "string" &&
        (item.SYON === "G" || item.SYON === "D") &&
        (item.SGUNTIPI === "C" || item.SGUNTIPI === "I" || item.SGUNTIPI === "P") &&
        (item.GUZERGAH_ISARETI === null || typeof item.GUZERGAH_ISARETI === "string") &&
        typeof item.SSERVISTIPI === "string" &&
        /^([01]?\d|2[0-3]):[0-5]\d$/.test(dt)
      );
    })
  );
}

function buildEnvelope(methodName: string, innerBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthHeader xmlns="http://tempuri.org/">
      <Username>user</Username>
      <Password>pass</Password>
    </AuthHeader>
  </soap:Header>
  <soap:Body>
    <${methodName} xmlns="http://tempuri.org/">
      ${innerBody}
    </${methodName}>
  </soap:Body>
</soap:Envelope>`;
}

function xml2json(xmlText: string, resultTag: string): unknown {
  const startTag = `<${resultTag}>`;
  const endTag = `</${resultTag}>`;

  const startIndex = xmlText.indexOf(startTag);
  const endIndex = xmlText.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Result tag not found: ${resultTag}`);
  }

  const jsonString = xmlText.slice(startIndex + startTag.length, endIndex);
  return JSON.parse(jsonString);
}

async function callSoap(url: string, methodName: string, innerBody: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOAP_TIMEOUT_MS);

  try {
    const envelope = buildEnvelope(methodName, innerBody);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"http://tempuri.org/${methodName}"`,
      },
      body: envelope,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const err = new Error(`SOAP HTTP ${response.status}: ${text.slice(0, 200)}`);
      (err as Error & { status?: number; kind?: string }).status = response.status;
      (err as Error & { status?: number; kind?: string }).kind = "upstream";
      throw err;
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const err = new Error("SOAP upstream timeout");
      (err as Error & { status?: number; kind?: string }).status = 504;
      (err as Error & { status?: number; kind?: string }).kind = "upstream_timeout";
      throw err;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createTTLCache<K, V>() {
  const store = new Map<K, { value: V; expiresAt: number }>();

  function get(key: K): V | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;

    if (Date.now() >= hit.expiresAt) {
      store.delete(key);
      return undefined;
    }

    return hit.value;
  }

  function set(key: K, value: V, ttlMs: number): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function deleteKey(key: K): void {
    store.delete(key);
  }

  function cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.expiresAt) {
        store.delete(key);
      }
    }
  }

  return { get, set, delete: deleteKey, cleanup };
}

const announcementsCache = createTTLCache<string, AnnouncementInfo[]>();
const routeTimesCache = createTTLCache<string, Result<DepartureTimeRemaining>>();

setInterval(() => {
  announcementsCache.cleanup();
  routeTimesCache.cleanup();
}, 30_000).unref?.();

async function callSoapLimited(
  url: string,
  methodName: string,
  innerBody: string,
): Promise<string> {
  return upstreamLimiter.schedule(() => callSoap(url, methodName, innerBody));
}

function getUpcomingDepartures(
  data: DepartureTimesJson[],
  now: Date,
): Date[] {
  const serviceDay = getCurrentServiceDayCode(now);

  const upcoming = data
    .filter((item) => item.SYON === "G" && item.SGUNTIPI === serviceDay)
    .map((item) => {
      const [hour, minute] = item.DT.split(":").map(Number);
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hour ?? 0,
        minute ?? 0,
        0,
        0,
      );
    })
    .filter((date) => date.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return upcoming;
}

async function fetchTimesForCode(busCode: string): Promise<Result<DepartureTimeRemaining>> {
  const normalizedCode = normalizeBusCode(busCode);
  const cached = routeTimesCache.get(normalizedCode);
  if (cached) return cached;

  let result: Result<DepartureTimeRemaining>;

  try {
    const departureTimeText = await callSoapLimited(
      "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
      "GetPlanlananSeferSaati_json",
      `<HatKodu>${normalizedCode}</HatKodu>`
    );

    const departureTimeData = xml2json(
      departureTimeText,
      "GetPlanlananSeferSaati_jsonResult",
    );

    if (!isDepartureTimeJson(departureTimeData)) {
      result = {
        ok: false,
        busCode: normalizedCode,
        error: { message: "Invalid departure time shape", kind: "parse" },
      };
      routeTimesCache.set(normalizedCode, result, TIMES_CACHE_TTL_MS);
      return result;
    }

    const now = getIstanbulNow();
    const upcoming = getUpcomingDepartures(departureTimeData, now);

    if (upcoming.length < 2) {
      result = {
        ok: false,
        busCode: normalizedCode,
        error: { message: "No upcoming departures found", kind: "nodata" },
      };
      routeTimesCache.set(normalizedCode, result, TIMES_CACHE_TTL_MS);
      return result;
    }

    result = {
      ok: true,
      busCode: normalizedCode,
      data: {
        timeRemaining: formatTimeDifference(upcoming[0], now),
        secondTimeReamining: formatTimeDifference(upcoming[1], now),
      },
    };

    routeTimesCache.set(normalizedCode, result, TIMES_CACHE_TTL_MS);
    return result;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = isRecord(e) && typeof e.status === "number" ? e.status : undefined;
    const kind = isRecord(e) && typeof e.kind === "string" ? e.kind : "soap";

    result = {
      ok: false,
      busCode: normalizedCode,
      error: { message, status, kind },
    };

    // short cache on errors too so one bad code doesn’t hammer upstream
    routeTimesCache.set(normalizedCode, result, 5000);
    return result;
  }
}

async function fetchAllAnnouncements(): Promise<AnnouncementInfo[]> {
  const cacheKey = "all";
  const cached = announcementsCache.get(cacheKey);
  if (cached) return cached;

  const responseText = await callSoapLimited(
    "https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx",
    "GetDuyurular_json",
    ""
  );

  const json = xml2json(responseText, "GetDuyurular_jsonResult");

  if (!isAnnouncementJsonArray(json)) {
    announcementsCache.set(cacheKey, [], ANNOUNCEMENTS_CACHE_TTL_MS);
    return [];
  }

  const mapped: AnnouncementInfo[] = json.map((item) => ({
    HATKODU: normalizeBusCode(item.HATKODU),
    HAT: item.HAT,
    TIP: item.TIP,
    GUNCELLEME_SAATI: item.GUNCELLEME_SAATI,
    MESAJ: item.MESAJ,
  }));

  announcementsCache.set(cacheKey, mapped, ANNOUNCEMENTS_CACHE_TTL_MS);
  return mapped;
}

async function getRelevantAnnouncements(busCodes: string[]): Promise<AnnouncementInfo[]> {
  const allAnnouncements = await fetchAllAnnouncements();
  const busSet = new Set(busCodes);

  return allAnnouncements.filter((item) => busSet.has(item.HATKODU));
}

function packResult(
  announcements: AnnouncementInfo[],
  timeResults: Result<DepartureTimeRemaining>[],
): BusRoutesResponse {
  const times: Record<string, DepartureTimeRemaining> = {};
  const errors: Record<string, Err["error"]> = {};

  for (const r of timeResults) {
    if (r.ok) {
      times[r.busCode] = r.data;
    } else {
      errors[r.busCode] = r.error;
    }
  }

  const failed = Object.keys(errors).length;
  const total = timeResults.length;
  const success = total - failed;

  return {
    ok: failed === 0,
    announcements,
    times,
    errors,
    summary: { total, success, failed },
  };
}

function parseBusCodesBody(value: unknown):
  | { ok: true; busCodes: string[] }
  | { ok: false; status: number; message: string } {
  if (!isRecord(value) || !Array.isArray(value.busCodes)) {
    return { ok: false, status: 400, message: "Invalid request body" };
  }

  if (value.busCodes.length === 0) {
    return { ok: false, status: 400, message: "No bus codes provided" };
  }

  if (value.busCodes.length > MAX_BUS_CODES) {
    return { ok: false, status: 400, message: `Maximum ${MAX_BUS_CODES} bus codes allowed` };
  }

  const rawCodes = value.busCodes;
  if (!rawCodes.every((x) => typeof x === "string")) {
    return { ok: false, status: 400, message: "All bus codes must be strings" };
  }

  const normalized = rawCodes.map(normalizeBusCode);

  if (normalized.some((code) => code.length === 0)) {
    return { ok: false, status: 400, message: "Bus codes cannot be empty" };
  }

  if (normalized.some((code) => !isValidBusCodeFormat(code))) {
    return { ok: false, status: 400, message: "One or more bus codes have invalid format" };
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const code of normalized) {
    if (seen.has(code)) duplicates.add(code);
    seen.add(code);
  }

  if (duplicates.size > 0) {
    return {
      ok: false,
      status: 400,
      message: `Duplicate bus codes are not allowed: ${Array.from(duplicates).join(", ")}`,
    };
  }

  return { ok: true, busCodes: normalized };
}

function createRouteTokenBucketLimiter(options: TokenBucketOptions): RequestHandler {
  const {
    capacity,
    refillPerSecond,
    keyFn = (req) => req.ip ?? "unknown",
    costFn = () => 1,
    cleanupIdleMs = 10 * 60 * 1000,
  } = options;

  if (capacity <= 0) throw new Error("capacity must be > 0");
  if (refillPerSecond <= 0) throw new Error("refillPerSecond must be > 0");

  const buckets = new Map<string, TokenBucketState>();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      if (now - state.lastSeenMs > cleanupIdleMs) {
        buckets.delete(key);
      }
    }
  }, Math.min(cleanupIdleMs, 60_000));

  cleanupTimer.unref?.();

  return (req: Request<{}, {}, unknown>, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFn(req);
    const existing = buckets.get(key);

    const state: TokenBucketState =
      existing ?? { tokens: capacity, lastRefillMs: now, lastSeenMs: now };

    state.lastSeenMs = now;

    const elapsedMs = now - state.lastRefillMs;
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1000) * refillPerSecond;
      state.tokens = Math.min(capacity, state.tokens + refill);
      state.lastRefillMs = now;
    }

    const cost = costFn(req);
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(500).json({ error: "Invalid limiter cost configuration" });
    }

    if (state.tokens > capacity) state.tokens = capacity;
    if (Math.abs(state.tokens) < 1e-9) state.tokens = 0;

    if (state.tokens < cost) {
      const missing = cost - state.tokens;
      const retryAfterSeconds = Math.ceil(missing / refillPerSecond);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Too many requests" });
    }

    state.tokens -= cost;
    buckets.set(key, state);
    next();
  };
}

function createUpstreamLeakyBucket(options: UpstreamLeakyBucketOptions) {
  const {
    leakRatePerSecond,
    maxQueueSize,
    maxConcurrent,
    maxQueueWaitMs,
  } = options;

  if (leakRatePerSecond <= 0) throw new Error("leakRatePerSecond must be > 0");
  if (maxQueueSize <= 0) throw new Error("maxQueueSize must be > 0");
  if (maxConcurrent <= 0) throw new Error("maxConcurrent must be > 0");
  if (maxQueueWaitMs <= 0) throw new Error("maxQueueWaitMs must be > 0");

  const leakIntervalMs = 1000 / leakRatePerSecond;
  const queue: UpstreamTask<unknown>[] = [];
  let inFlight = 0;
  let nextStartMs = Date.now() - leakIntervalMs;
  let pumpTimer: ReturnType<typeof setTimeout> | null = null;

  function makeLimiterError(message: string, status: number, kind: string): Error {
    const err = new Error(message);
    (err as Error & { status?: number; kind?: string }).status = status;
    (err as Error & { status?: number; kind?: string }).kind = kind;
    return err;
  }

  function schedulePump(delayMs: number): void {
    if (pumpTimer !== null) return;
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      pump();
    }, Math.max(0, delayMs));
  }

  function expireStaleQueuedTasks(now: number): void {
    while (queue.length > 0) {
      const head = queue[0];
      if (!head) break;
      if (now - head.enqueuedAtMs <= maxQueueWaitMs) break;

      queue.shift();
      head.reject(makeLimiterError("Upstream queue timeout", 503, "upstream_queue_timeout"));
    }
  }

  function pump(): void {
    const now = Date.now();
    expireStaleQueuedTasks(now);

    while (inFlight < maxConcurrent && queue.length > 0) {
      const currentNow = Date.now();
      const waitMs = nextStartMs - currentNow;

      if (waitMs > 0) {
        schedulePump(waitMs);
        return;
      }

      const task = queue.shift();
      if (!task) return;

      nextStartMs = Math.max(nextStartMs, currentNow) + leakIntervalMs;
      inFlight += 1;

      task.run()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          inFlight -= 1;
          pump();
        });
    }
  }

  function schedule<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (queue.length >= maxQueueSize) {
        reject(makeLimiterError("Upstream queue full", 503, "upstream_queue_full"));
        return;
      }

      const wrappedTask: UpstreamTask<T> = {
        run,
        resolve,
        reject,
        enqueuedAtMs: Date.now(),
      };

      queue.push(wrappedTask as UpstreamTask<unknown>);
      pump();
    });
  }

  function stats() {
    return {
      queueLength: queue.length,
      inFlight,
      leakIntervalMs,
      nextStartMs,
    };
  }

  return { schedule, stats };
}

const upstreamLimiter = createUpstreamLeakyBucket({
  leakRatePerSecond: 8,
  maxQueueSize: 200,
  maxConcurrent: 3,
  maxQueueWaitMs: 8000,
});

const healthLimiter = createRouteTokenBucketLimiter({
  capacity: 10,
  refillPerSecond: 0.25,
});

const busRoutesLimiter = createRouteTokenBucketLimiter({
  capacity: 5,
  refillPerSecond: 0.2,
});

const app = express();

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "16kb" }));
app.use("/assets", express.static("assets"));
app.use("/otobus", express.static("frontend"));

app.get("/health", healthLimiter, (_req, res) => {
  return res.json({ status: "ok" });
});

app.get("/ping", (_req, res) => {
  return res.json({
    ok: true,
    now: Date.now(),
    upstream: upstreamLimiter.stats(),
  });
});

app.post(
  "/otobus/routes",
  busRoutesLimiter,
  async (req: Request<{}, {}, unknown>, res: Response) => {
    const parsed = parseBusCodesBody(req.body);

    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.message });
    }

    const busCodes = parsed.busCodes;

    try {
      const [announcements, timeResults] = await Promise.all([
        getRelevantAnnouncements(busCodes),
        Promise.all(busCodes.map(fetchTimesForCode)),
      ]);

      return res.json(packResult(announcements, timeResults));
    } catch (error: unknown) {
      console.error("Server error:", error);

      if (!res.headersSent) {
        return res.status(500).json({ error: "Request failed" });
      }
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});