//[TODO] Implement cache system
//[TODO] Check the networking sizes 
//[TODO] I need optimizations ASAP
//[TODO] Make the data type checks stricter for example check 4 duplicate bus codes
//[TODO] Big ass clean up time. For example busCode set always gets normalized inside fns
//[TODO] Is gunu cumartesi pazar turlerini suanki tarihe gore gec

/* !!!!!!!!!!!!!!!!!!
* BIG ASS TODO: Rewrite the response type so it features timestamp of server time + includes HATYONU, HATADI, GUZERGAH_ISARETI;
* NOT PRECOMPUTED DEPARTURE TIME, THE ABSOLUTE ONE let the client compute remaing time.
*/

import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import cors from "cors";

/* ==================
* RATE LIMITER ZONE 
================= */

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

/* ==========
* TYPE ZONE
========== */ 

// ========== NEW TPYES LES GO ==========
type direction = "D" | "G"; 
type dayType = "I" | "C" | "P";

type busRoute = {
  busCode: string,
  direction: direction,
  dayType: dayType
}

type busRoutesBody = {
  busRoutes: busRoute[]
}

// Json parsing type
type announcementJson = {
  HATKODU: string;
  HAT: string;
  TIP: "Günlük" | "Sefer" | string; 
  GUNCELLEME_SAATI: string;        
  MESAJ: string;
};

// Response type
type announcementInfo = {
  "HATKODU": string;
  /* Could add these in the future
  "HAT": string;
  TIP": "Günlük" | "Sefer" | string; */
  "GUNCELLEME_SAATI": string;    
  "MESAJ": string;
};

// Json parsing type
type departureTimesJson = {
  SHATKODU: string; 
  HATADI: string;
  SGUZERAH: string;
  SYON: string;
  SGUNTIPI: string;
  GUZERGAH_ISARETI: string;
  SSERVISTIPI: string; 
  DT: string;
};

// Response type
type departureTimesInfo = {
  "SHATKODU": string;
  "HATADI": string;
  // Could add these in the future
  //"SGUZERAH": string;
  "SYON": string;
  "SGUNTIPI": string;
  "GUZERGAH_ISARETI": string;
  //"SSERVISTIPI": string; 
  "DT": string;
};

type BusRoutesResponse = {
  ok: boolean;
  announcements: announcementInfo[];
  times: Record<string, departureTimesInfo[]>;
  errors: Record<string, Err["error"]>;
  summary: { total: number; success: number; failed: number };
};

// ====== Rust shi =======
type Ok<T> = { ok: true; busCode: string; data: T };
type Err = { ok: false; busCode: string; error: { message: string; status?: number; kind: string } };
type Result<T> = Ok<T> | Err;

// ====== JS Date fuckery ======
type IstanbulDatePart = "year" | "month" | "day" | "hour" | "minute" | "second";

function isBusRoute(x: any): x is busRoute{
  return (
    x &&
    typeof x === "object" &&
    typeof x.busCode === "string" &&
    (x.direction === "D" || x.direction === "G") &&
    (x.dayType === "I" || x.dayType === "C" || x.dayType === "P") 
  );
}

function isBusRoutesBody(value: unknown): value is busRoutesBody{
  return (
    typeof value === "object" &&
    value !== null &&
    "busRoutes" in value &&
    Array.isArray((value as { busRoutes?: unknown }).busRoutes) &&
    (value as { busRoutes: unknown[] }).busRoutes.every((x) => isBusRoute(x)) &&
    (value as { busRoutes: unknown[] }).busRoutes.length <= 5
  );
}

function isAnnouncementJsonArray(x: any): x is announcementJson[] {
  return (
    Array.isArray(x) &&
    x.every((item: any) =>
      item &&
      typeof item === "object" &&
      typeof item.HATKODU === "string" &&
      typeof item.HAT === "string" &&
      typeof item.TIP === "string" &&
      typeof item.GUNCELLEME_SAATI === "string" &&
      typeof item.MESAJ === "string"
    )
  );
}

function isDepartureTimeJson(value: unknown): value is departureTimesJson[] {
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
  //I legit have no idea why they
  //Future mrz here! 
  //What the fuck is this bruh
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

async function callSoap(url: string, methodName: string, innerBody: string): Promise<string> {
  const envelope = buildEnvelope(methodName, innerBody);

  const response = await fetch(url, {
      method: "POST",
      headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": `"http://tempuri.org/${methodName}"`
      },
      body: envelope,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`SOAP HTTP ${response.status}: ${text.slice(0, 200)}`);
    (err as any).status = response.status;
    (err as any).kind = "upstream";
    throw err;
  }

  return await response.text();
}

async function callSoapLimited(
  url: string,
  methodName: string,
  innerBody: string,
): Promise<string> {
  return upstreamLimiter.schedule(() => callSoap(url, methodName, innerBody));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function xml2json(xmlText: string, resultTag: string): unknown {
  const startTag = `<${resultTag}>`;
  const endTag = `</${resultTag}>`;

  const startIndex = xmlText.indexOf(startTag);
  const endIndex = xmlText.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1) {
      throw new Error("Result tag not found");
  }

  const jsonString = xmlText.substring(
      startIndex + startTag.length,
      endIndex
  );

  return JSON.parse(jsonString);
}

function getDatePartNumber(
  parts: Intl.DateTimeFormatPart[],
  partType: IstanbulDatePart,
): number {
  const value = parts.find((part) => part.type === partType)?.value;

  if (!value) {
    throw new Error(`Missing date part: ${partType}`);
  }

  return Number(value);
}

//[TODO] Check date values in deployment

function getIstanbulNow(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
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

//[TODO]: fixy fix fix
function filterData(
  data: departureTimesJson[],
  turkeyNow: Date,
  direction: direction,
  dayType: dayType ): departureTimesInfo[] {

  const filteredData = data.filter(
    (item) => item.SYON === direction && item.SGUNTIPI === dayType,
  );

  // ELIMINATE THE STUFFZ
  const correctTypeData: departureTimesInfo[] = filteredData.map((element) => {
    return {
    SHATKODU: element.SHATKODU,
    HATADI: element.HATADI,
    SYON: element.SYON,
    SGUNTIPI: element.SGUNTIPI,
    GUZERGAH_ISARETI: element.GUZERGAH_ISARETI,
    DT: element.DT,
  };
  });

  // Here lies sort function | RIP |

  return correctTypeData;
}

async function fetchTimesForCode(busCode: string, direction: direction, dayType: dayType): Promise<Result<departureTimesInfo[]>> {
  try {
    const departureTimeText = await callSoapLimited(
      "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
      "GetPlanlananSeferSaati_json",
      `<HatKodu>${busCode}</HatKodu>`
    );

    // There wasnt a await like huh
    const departureTimeData = await xml2json(departureTimeText, "GetPlanlananSeferSaati_jsonResult");

    if (!isDepartureTimeJson(departureTimeData)) {
      return {
        ok: false,
        busCode,
        error: { message: "Invalid departure time shape", kind: "parse" },
      };
    }

    const finalData = filterData(departureTimeData,getIstanbulNow(), direction, dayType);

    // TODO: Return all of the bus times
    return { ok: true, busCode, data: finalData };

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = (e as any)?.status as number | undefined;
    const kind = (e as any)?.kind as string | undefined;

    return {
      ok: false,
      busCode,
      error: { message, status, kind: kind ?? "soap" },
    };
  }
}

async function fetchAllAnnouncements(): Promise<string>{
  const response = callSoapLimited(
    "https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx",
    "GetDuyurular_json",
    `` );
  
    return response;
}

async function getRelevantAnnouncements(busCodes: string[]): Promise<announcementInfo[]>{
  const rawAllAnnnouncements = await fetchAllAnnouncements();
  const jsonAllAnnouncements = xml2json(rawAllAnnnouncements,"GetDuyurular_jsonResult");

  if (!isAnnouncementJsonArray(jsonAllAnnouncements)) {
    return [];
  }

  const normalize = (s: unknown) => String(s ?? "").trim().toUpperCase();
  const busSet = new Set(busCodes.map(normalize));

  const relevant = jsonAllAnnouncements.filter(item =>
    busSet.has(normalize(item.HATKODU))
  );

  const relevantAnnouncements: announcementInfo[] = [];

  relevant.forEach((item) => {
    relevantAnnouncements.push({
      "HATKODU": item.HATKODU,
      "GUNCELLEME_SAATI": item.GUNCELLEME_SAATI,      
      "MESAJ": item.MESAJ
    });
  })

  return relevantAnnouncements;  
}

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

// Get needed datas
function toBusRouteArray(request: unknown){
  if(!isBusRoutesBody(request)) {
    console.log("Can't convert non bus route to bus route");
    return [];
  }

  const data: busRoute[] = request.busRoutes.map((element) => {
    return {
      busCode: element.busCode,
      direction: element.direction,
      dayType: element.dayType
    }
  })

  return data;
}

// TODO: Yeah im slimming you brochalalala
function packResult(
  announcements: announcementInfo[],
  timeResults: Result<departureTimesInfo[]>[],
): BusRoutesResponse {
  const times: Record<string, departureTimesInfo[]> = {};
  const errors: Record<string, Err["error"]> = {};

  for (const r of timeResults) {
    if (r.ok) times[normalizeBusCode(r.busCode)] = r.data;
    else errors[normalizeBusCode(r.busCode)] = r.error;
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

function createRouteTokenBucketLimiter(options: TokenBucketOptions): RequestHandler {
  const {
    capacity,
    refillPerSecond,
    keyFn = (req) => req.ip ?? "unknown",
    costFn = () => 1,
    cleanupIdleMs = 10 * 60 * 1000,
  } = options;

  if (capacity <= 0) throw new Error("capacity must be > 0 twin");

  if (refillPerSecond <= 0) throw new Error("refillPerSecond must be > 0 twan");

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

    //Weird js floating point fuckery edge case plz ignore
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
//==========================================================================

function createUpstreamLeakyBucket(options: UpstreamLeakyBucketOptions) {
  const {
    leakRatePerSecond,
    maxQueueSize,
    maxConcurrent,
    maxQueueWaitMs,
  } = options;

  if (leakRatePerSecond <= 0) throw new Error("leakRatePerSecond must be > 0 twralala");
  if (maxQueueSize <= 0) throw new Error("maxQueueSize must be > 0 twilollo");
  if (maxConcurrent <= 0) throw new Error("maxConcurrent must be > 0 twinkies");  
  if (maxQueueWaitMs <= 0) throw new Error("maxQueueWaitMs must be > 0 twinky");

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

      head.reject(
        makeLimiterError("Upstream queue timeout", 503, "upstream_queue_timeout"),
      );
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

      task
        .run()
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

//------------------------------------------------------------------------------

const app = express();

// ======== Rate limiting stuff ========

const healthLimiter =   createRouteTokenBucketLimiter({
  capacity: 10,
  refillPerSecond: 0.25,
})

const busRoutesLimiter = createRouteTokenBucketLimiter({
  capacity: 5,
  refillPerSecond: 0.2,
});

const upstreamLimiter = createUpstreamLeakyBucket({
  leakRatePerSecond: 8, 
  maxQueueSize: 200,    
  maxConcurrent: 5,     
  maxQueueWaitMs: 8000, // drop if stuck in queue too long
});

// [CAUTION]: Might need to delete this
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json())
app.use("/assets", express.static("assets"));
app.use("/",express.static("frontend"));

app.get("/health", healthLimiter, (req,res) => { 
  return res.json({
    "status": "Chain ain't snatched twin"
  });
})

app.get("/ping", (req, res) => {
  res.json({
    ok: true,
    now: Date.now(),
    ip: req.ip,
    ips: req.ips,
    socketRemoteAddress: req.socket.remoteAddress,
    xForwardedFor: req.headers["x-forwarded-for"],
    xRealIp: req.headers["x-real-ip"],
    cfConnectingIp: req.headers["cf-connecting-ip"],
    xForwardedProto: req.headers["x-forwarded-proto"],
  });
});

app.post(("/otobus/routes"), busRoutesLimiter, async (req: Request<{}, {}, unknown>, res: Response) => {
  
  if (!isBusRoutesBody(req.body)) {
    return res.status(400).send("Invalid request body");
  }

  // TODO: This shit needs to go to a func bruh
  const busCodes: string[] = [...new Set(
    req.body.busRoutes.map((c) => c.busCode.trim().toUpperCase() ).filter(Boolean)
  )];

  const busRoutes = toBusRouteArray(req.body);

  if(busRoutes.length === 0){
    return res.status(400).json({error: "No bus codes provided"});
  } if(busRoutes.length > 5) {
    return res.status(400).json({error: "Bruh what more than 5!?"});
  }

  try {
    const announcementTask = async () => {
      return await getRelevantAnnouncements(busCodes);
    };

    const timesTask = async () => {
      const tasks = busRoutes.map((code) => async () => {
        return fetchTimesForCode(code.busCode,code.direction,code.dayType);
      });

      return await Promise.all(tasks.map(fn => fn()));
    };

    const [announcements, timeResults] = await Promise.all([
      announcementTask(),
      timesTask(),
    ]);

    const packed = packResult(announcements, timeResults);
    return res.json(packed);

  } catch (error: unknown) {
      console.error("Server says:", error);

      if (!res.headersSent) {
        res.status(500).send("Request failed");
      }
  }
})

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
