import express from "express";
import cors from "cors";
import type { JsonSourceFile } from "typescript";

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

function xml2json(xmlText: string, resultTag: string): JSON {
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

function getTimeDifference(time: number, timeNow: number): string{
  const diffMs = time - timeNow;
  const diffMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  return`${hours}:${minutes.toString().padStart(2, '0')}`;
}

function getCorrectAnnouncement(
  json: Array<{ HATKODU?: string }>,
  hat: string | number,
): Array<{ HATKODU?: string }> {
  return json.filter((item) => item.HATKODU?.trim() === String(hat).trim());
}

const app = express();

app.use(cors);
app.use(express.static("src"));
app.use("/assets", express.static("assets"));

app.get("/bus/:hatKodu", async (req, res) => {
    const hat = req.params.hatKodu;

    try{

    } catch (err){

    }
})
