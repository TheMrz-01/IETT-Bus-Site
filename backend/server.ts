//[TODO] Implement cache system
//[TODO] Implement rate limit
import express, { type Request, type Response, type json } from "express";
import cors, { type CorsOptions } from "cors";

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

  return response.text();
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

async function fetchTimesForCodes(busCode: string, ) {
  const departureTimeText = await callSoap(
    "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
    "GetPlanlananSeferSaati_json",
    `<HatKodu>${busCode}</HatKodu>`
  )

  const departureTimeData = xml2json(departureTimeText,"GetPlanlananSeferSaati_jsonResult");

  if(!isDepartureTimeJson(departureTimeData)){
    throw new Error("Invalid departure time shape");
  }

  const turkeyNow: Date = getIstanbulNow();

  const correctTypeData: Date[] = getCorrectTypeData(departureTimeData, turkeyNow);

  if (correctTypeData[0] instanceof Date && correctTypeData[1] instanceof Date
    && turkeyNow <= correctTypeData[0]) {

  return ({
      timeRemaining: getTimeDifference(correctTypeData[0], turkeyNow),
      secondTimeReamining: getTimeDifference(correctTypeData[1], turkeyNow),
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

    return ({
      timeRemaining: firstDT,
      secondTimeReamining: secondDT,
    });
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

  const codeSet = new Set(busCodes.map(String));

  const relevant = jsonAllAnnouncements.filter(item =>
    busCodes.some(code => item.HATKODU.includes(code))
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

function indexAnnouncementsByCode(
  announcements: announcementInfo[],
): Map<string, announcementInfo[]> {
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

//------------------------------------------------------------------------------

const app = express();

app.use(cors());
app.use(express.json())
app.use(express.static("frontend"));
app.use("/assets", express.static("assets"));

app.post(("/bus/routes"), async (req: Request<{}, {}, unknown>, res: Response) => {
  if (!isBusCodesBody(req.body)) {
    return res.status(400).send("Invalid request body");
  }

  const busCodes: string[] = [...new Set(
    req.body.busCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  )];

  if(busCodes.length === 0){
    return res.status(400).json({error: "No bus codes provided"});
  } if(busCodes.length > 10) {
    return res.status(400).json({error: "Bruh what 10!?"});
  }

  try{
    const [AllAnnouncements, departureTimes] = await Promise.all([
      getRelevantAnnouncements(busCodes),
      Promise.allSettled(busCodes.map((code) => fetchTimesForCodes(code)))
    ]);

    //[TODO]: Do your magic
    const results = {};

    return res.json( {results} );

  } catch(error: unknown){
      console.error("Server says: " + error);
      if (!res.headersSent) {
        res.status(500).send("SOAP request failed");
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
