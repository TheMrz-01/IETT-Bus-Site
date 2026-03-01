//[TODO] Implement cache system
//[TODO] Implement Token Bucket
//[TODO] Check the networking sizes
//[TODO] I need optimizations ASAP
//[TODO] Make the data type checks stricter for example check 4 duplicate bus codes
//[TODO] Big ass clean up time. For example busCode set always gets normalized inside fns
import express from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import cors from "cors";

type IncomingPacket = {
  tokenSize: number;
};

type TokenBucket = {
  bucketSize: number; //Bytes?
  tokenNumber: number; //Bytes?
  tokenGenerationRate: number; //Same
  tokenConsumptionRule: number; //Geeked all day 4 dis omg bruhh
  bucketQueue: IncomingPacket[];
};

type BusCodesBody = {
  busCodes: string[];
};

type announcementJson = {
  HATKODU: string;
  HAT: string;
  TIP: "Günlük" | "Sefer" | string; 
  GUNCELLEME_SAATI: string;        
  MESAJ: string;
};

type announcementInfo = {
  "HATKODU": string;
  "HAT": string;
  "TIP": "Günlük" | "Sefer" | string; 
  "GUNCELLEME_SAATI": string;        
  "MESAJ": string;
};

type departureTimesJson = {
  SHATKODU: string;
  HATADI: string;
  SGUZERAH: string;
  SYON: string;
  SGUNTIPI: string;
  GUZERGAH_ISARETI: null;
  SSERVISTIPI: string;
  DT: string;
};

type departureTimesInfo = {
  "SHATKODU": string;
  "HATADI": string;
  "SGUZERAH": string;
  "SYON": string;
  "SGUNTIPI": string;
  "GUZERGAH_ISARETI": null;
  "SSERVISTIPI": string;
  "DT": string;
};

type departureTimeRemaining = {
  timeRemaining: string;
  secondTimeReamining: string;
}

type BusRoutesResponse = {
  ok: boolean;
  announcements: announcementInfo[];
  times: Record<string, departureTimeRemaining>;
  errors: Record<string, Err["error"]>;
  summary: { total: number; success: number; failed: number };
};

type Ok<T> = { ok: true; busCode: string; data: T };
type Err = { ok: false; busCode: string; error: { message: string; status?: number; kind: string } };
type Result<T> = Ok<T> | Err;

type IstanbulDatePart = "year" | "month" | "day" | "hour" | "minute" | "second";

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
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:xsd="http://www.w3.org/2001/XMLSchema"
      xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      
    <soap:Header>
      <AuthHeader xmlns="http://tempuri.org/">
        <Username>YOUR_USERNAME</Username>
        <Password>YOUR_PASSWORD</Password>
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

function getTimeDifference(time: Date, timeNow: Date): string{
  const diffMs = time.getTime() - timeNow.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  return`${hours}:${minutes.toString().padStart(2, '0')}`;
}

function isBusCodesBody(value: unknown): value is BusCodesBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "busCodes" in value &&
    Array.isArray((value as { busCodes?: unknown }).busCodes) &&
    (value as { busCodes: unknown[] }).busCodes.every((x) => typeof x === "string") &&
    (value as { busCodes: unknown[] }).busCodes.length <= 5
  );
}

//[TODO]: fixy fix fix
function getCorrectTypeData(
  data: departureTimesInfo[],
  turkeyNow: Date ): Date[] {

  const filteredData = data.filter(
    (item) => item.SYON === "G" && item.SGUNTIPI === "I",
  );

  const correctTypeData = filteredData.map((element) => {
    const [hour = 0, minute = 0] = element.DT.split(":").map(Number);

    return new Date(
      turkeyNow.getFullYear(),
      turkeyNow.getMonth(),
      turkeyNow.getDate(),
      hour,
      minute,
      0,
      0,
    );
  });

  correctTypeData.sort((a, b) => a.getTime() - b.getTime());

  return correctTypeData;
}

async function fetchTimesForCode(busCode: string): Promise<Result<departureTimeRemaining>> {
  try {
    const departureTimeText = await callSoap(
      "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
      "GetPlanlananSeferSaati_json",
      `<HatKodu>${busCode}</HatKodu>`
    );

    const departureTimeData = xml2json(departureTimeText, "GetPlanlananSeferSaati_jsonResult");

    if (!isDepartureTimeJson(departureTimeData)) {
      return {
        ok: false,
        busCode,
        error: { message: "Invalid departure time shape", kind: "parse" },
      };
    }

    const turkeyNow = getIstanbulNow();
    const correctTypeData = getCorrectTypeData(departureTimeData, turkeyNow);

    let firstBus: Date | undefined;
    let secondBus: Date | undefined;

    for (let i = 0; i < correctTypeData.length; i++) {
      const cur = correctTypeData[i];
      if (cur instanceof Date && cur > turkeyNow) {
        firstBus = cur;
        secondBus = correctTypeData[i + 1];
        break;
      }
    }

    if (!firstBus || !(secondBus instanceof Date)) {
      return {
        ok: false,
        busCode,
        error: { message: "No upcoming departures found", kind: "nodata" },
      };
    }

    const data: departureTimeRemaining = {
      timeRemaining: getTimeDifference(firstBus, turkeyNow),
      secondTimeReamining: getTimeDifference(secondBus, turkeyNow),
    };

    return { ok: true, busCode, data };
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
  const response = callSoap(
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
      "HAT": item.HAT,
      "TIP": item.TIP, 
      "GUNCELLEME_SAATI": item.GUNCELLEME_SAATI,      
      "MESAJ": item.MESAJ
    });
  })

  return relevantAnnouncements;  
}

//[TODO]: Check these
function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

function indexAnnouncementsByCode( announcements: announcementInfo[], ): 
    Map<string, announcementInfo[]> {
  const map = new Map<string, announcementInfo[]>();
  for (const item of announcements) {
    const code = normalizeBusCode(item.HATKODU ?? "");

    if (!code) continue;

    const current = map.get(code) ?? [];

    current.push(item);
    map.set(code, current);
  }
  return map;
}

function packResult(
  announcements: announcementInfo[],
  timeResults: Result<departureTimeRemaining>[],
): BusRoutesResponse {
  const times: Record<string, departureTimeRemaining> = {};
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

async function tokenBucketAlgorithm(tokenBucket: TokenBucket, incomingPacket: IncomingPacket){
 //[TODO]: One overstimulations session later i am deeply embarressed of this code legit wtf was i smoking here
 //#1 while true loop inside a async 
 //#2 a globa bucket ??? wtf ??
 //#3 no ip checking whatsoever
 //#4 queue logic wrong check packet sizes before shifting one
 //#5 lacks actual sleep function 
 //I have decided to remove this code from existence no human being shall see this abomination and im again deeply ambarressed
}

//------------------------------------------------------------------------------

const app = express();

app.use(cors());
app.use(express.json())
app.use(express.static("frontend"));
app.use("/assets", express.static("assets"));

//[TODO]: Write actual values
const tokenBucket: TokenBucket = {
  bucketSize: 10,
  tokenNumber: 20,
  tokenGenerationRate: 30,
  tokenConsumptionRule: 30,
  bucketQueue: []
}

app.post(("/bus/routes"), async (req: Request<{}, {}, unknown>, res: Response) => {
  if (!isBusCodesBody(req.body)) {
    return res.status(400).send("Invalid request body");
  }

  const busCodes: string[] = [...new Set(
    req.body.busCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  )];

  if(busCodes.length === 0){
    return res.status(400).json({error: "No bus codes provided"});
  } if(busCodes.length > 5) {
    return res.status(400).json({error: "Bruh what more than 5!?"});
  }

  const incomingPacket: IncomingPacket = {
    tokenSize: busCodes.length
  };

  try {
    const announcementTask = async () => {
      await tokenBucketAlgorithm(tokenBucket, incomingPacket);
      return await getRelevantAnnouncements(busCodes);
    };

    const timesTask = async () => {
      const tasks = busCodes.map((code) => async () => {
        await tokenBucketAlgorithm(tokenBucket, incomingPacket);
        return fetchTimesForCode(code);
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

/*
app.get("/bus/:hatKodu", async (req, res) => {
    const hat: string = req.params.hatKodu;

    try{
      const [
        seferXml,
        duyuruXml
      ] = await Promise.all([
        callSoap(
          "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
          "GetPlanlananSeferSaati_json",
          `<HatKodu>${hat}</HatKodu>`
        ),

        callSoap(
          "https://api.ibb.gov.tr/iett/UlasimDinamikVeri/Duyurular.asmx",
          "GetDuyurular_json",
          `<HatKodu>${hat}</HatKodu>`
        )
      ]);

      const seferData = toSeferItems(
        xml2json(seferXml, "GetPlanlananSeferSaati_jsonResult"),
      );

      const duyuruData = toAnnouncementItems(
        xml2json(duyuruXml, "GetDuyurular_jsonResult"),
      );

      const turkeyNow: Date = getIstanbulNow();

      const correctTypeData: Date[] = getCorrectTypeData(seferData, turkeyNow);

      if (correctTypeData[0] instanceof Date && correctTypeData[1] instanceof Date
        && turkeyNow <= correctTypeData[0]) {

        return res.json({
          timeRemaining: getTimeDifference(correctTypeData[0], turkeyNow),
          secondTimeReamining: getTimeDifference(correctTypeData[1], turkeyNow),
          announcement: getCorrectAnnouncement(duyuruData, hat)
        });
      }

      let firstBus = undefined;
      let secondBus = undefined;
      
      for (let i = 0; i < correctTypeData.length; i++) {
        const cur = correctTypeData[i];

        if (cur && cur instanceof Date && cur > turkeyNow) {
          firstBus = cur;
      
          if (i + 1 < correctTypeData.length) {
            secondBus = correctTypeData[i + 1];
          }
      
          break;
        } 
      }

      if (firstBus && secondBus) {
        const firstDT = getTimeDifference(firstBus, turkeyNow);
        const secondDT = getTimeDifference(secondBus, turkeyNow);
        const correctAnnouncements = getCorrectAnnouncement(duyuruData, hat);

        return res.json({
          timeRemaining: firstDT,
          secondTimeReamining: secondDT,
          announcement: correctAnnouncements
        });
      }

    } catch (err){
        console.error(err);
        if (!res.headersSent) {
          res.status(500).send("SOAP request failed");
        }
    }
})
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
