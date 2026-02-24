//[TODO] Implement cache system
//[TODO] Implement rate limit
//[TODO] Get proper output
import express, { type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";

type SeferItem = {
  SYON: string;
  SGUNTIPI: string;
  DT: string;
};

type AnnouncementItem = {
  HATKODU: string;
  MESAJ?: string;
};

type IstanbulDatePart = "year" | "month" | "day" | "hour" | "minute" | "second";

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

function toSeferItems(value: unknown): SeferItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const syon = item.SYON;
    const sguntipi = item.SGUNTIPI;
    const dt = item.DT;

    if (typeof syon !== "string" || typeof sguntipi !== "string" || typeof dt !== "string") {
      return [];
    }

    return [{ SYON: syon, SGUNTIPI: sguntipi, DT: dt }];
  });
}

function toAnnouncementItems(value: unknown): AnnouncementItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const hatKodu = item.HATKODU;
    const mesaj = item.MESAJ;

    if (typeof hatKodu !== "string") {
      return [];
    }

    if (typeof mesaj === "string") {
      return [{ HATKODU: hatKodu, MESAJ: mesaj }];
    }

    return [{ HATKODU: hatKodu }];
  });
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

//[TODO] Check values in depomen
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

function getCorrectAnnouncement(
  json: AnnouncementItem[],
  hat: string,
): AnnouncementItem[] {
  return json.filter((item) => item.HATKODU?.trim() === String(hat).trim());
}

function getCorrectTypeData(
  data: SeferItem[],
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

const app = express();

app.use(cors());
app.use(express.static("frontend"));
app.use("/assets", express.static("assets"));

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
