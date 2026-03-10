//[TODO]: Add a toggle switch for different type of heading

//[TODO]: Could add ok type
type Err = { ok: false; busCode: string; error: { message: string; status?: number; kind: string } };

type AnnouncementItem = {
  MESAJ?: string;
};

type BusResponse = {
  timeRemaining?: string;
  secondTimeReamining?: string;
  announcement?: AnnouncementItem[];
};

//TEMP TYPE
type announcementInfo = {
  "HATKODU": string;
  "HAT": string;
  "TIP": "Günlük" | "Sefer" | string; 
  "GUNCELLEME_SAATI": string;        
  "MESAJ": string;
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

function getBusCodesFromTable(body: HTMLTableSectionElement): string[] {
  return Array.from(body.rows)
    .map((row) => normalizeBusCode(row.cells[0]?.textContent ?? ""))
    .filter((code) => code.length > 0);
}


const busCodeInput = document.getElementById("busCodeInput");
const busTableBtn = document.getElementById("busTableBtn");
const departureTimeBtn = document.getElementById("departureTimeBtn");
const busTable = document.querySelector(".busTable");
const announcementTable = document.querySelector(".announcementTable");

if (
  !(busCodeInput instanceof HTMLInputElement) ||
  !(busTableBtn instanceof HTMLButtonElement) ||
  !(departureTimeBtn instanceof HTMLButtonElement) ||
  !(busTable instanceof HTMLTableElement) ||
  !(announcementTable instanceof HTMLTableElement)
) {
  throw new Error("Required DOM elements were not found");
}

const busCodeInputEl = busCodeInput;
const busTableBtnEl = busTableBtn;
const departureTimeBtnEl = departureTimeBtn;
const busTableEl = busTable;
const announcementTableEl = announcementTable;

const busTableBody = busTableEl.tBodies.item(0) ?? busTableEl.createTBody();
const announcementTableBody =
  announcementTableEl.tBodies.item(0) ?? announcementTableEl.createTBody();

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

function isBusRoutesResponse(value: unknown): value is BusRoutesResponse {
  if (!isRecord(value)) return false;

  if (typeof value.ok !== "boolean") return false;

  if (!Array.isArray(value.announcements)) return false;
  if (!value.announcements.every(isAnnouncementInfo)) return false;

  if (!isRecord(value.times)) return false;
  for (const [k, v] of Object.entries(value.times)) {
    if (typeof k !== "string") return false; 
    if (!isDepartureTimeRemaining(v)) return false;
  }

  if (!isRecord(value.errors)) return false;
  for (const [k, v] of Object.entries(value.errors)) {
    if (typeof k !== "string") return false;
    if (!isErrErrorShape(v)) return false;
  }

  if (!isRecord(value.summary)) return false;
  if (!isNonNegativeInt(value.summary.total)) return false;
  if (!isNonNegativeInt(value.summary.success)) return false;
  if (!isNonNegativeInt(value.summary.failed)) return false;

  if (value.summary.total !== value.summary.success + value.summary.failed) return false;

  if (Object.keys(value.times).length > value.summary.total) return false;
  if (Object.keys(value.errors).length > value.summary.total) return false;

  return true;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isNonNegativeInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}

function isAnnouncementInfo(x: unknown): x is announcementInfo {
  if (!isRecord(x)) return false;

  return (
    typeof x.HATKODU === "string" &&
    typeof x.HAT === "string" &&
    typeof x.TIP === "string" &&
    typeof x.GUNCELLEME_SAATI === "string" &&
    typeof x.MESAJ === "string"
  );
}

function isDepartureTimeRemaining(x: unknown): x is departureTimeRemaining {
  if (!isRecord(x)) return false;

  return (
    typeof x.timeRemaining === "string" &&
    typeof x.secondTimeReamining === "string"
  );
}

function isErrErrorShape(x: unknown): x is Err["error"] {
  if (!isRecord(x)) return false;

  if (typeof x.message !== "string") return false;
  if (typeof x.kind !== "string") return false;

  if ("status" in x && x.status !== undefined) {
    if (typeof x.status !== "number" || !Number.isFinite(x.status)) return false;
  }

  return true;
}

function createBusRow(busCode: string): HTMLTableRowElement {
  const row = document.createElement("tr");

  const busCodeCell = document.createElement("td");
  busCodeCell.textContent = normalizeBusCode(busCode);

  const firstTimeCell = document.createElement("td");
  firstTimeCell.textContent = "";

  const secondTimeCell = document.createElement("td");
  secondTimeCell.textContent = "";

  const actionCell = document.createElement("td");
  actionCell.className = "cellAction";

  const removeButton = document.createElement("button");
  removeButton.className = "rowRemoveBtn";
  removeButton.type = "button";
  removeButton.setAttribute("data-remove-row", "");
  removeButton.setAttribute("aria-label", "Satiri sil");
  removeButton.textContent = "-";

  actionCell.appendChild(removeButton);

  row.append(busCodeCell, firstTimeCell, secondTimeCell, actionCell);
  return row;
}

function addBusFromInput(): void {
  const uniqueBusCodes = [...new Set(getBusCodesFromTable(busTableBody))];
  if(uniqueBusCodes.length > 4) {alert("Max 5 buses can be added"); return; }

  const busCode = normalizeBusCode(busCodeInputEl.value);

  if(uniqueBusCodes.includes(busCode)) return;

  if (!busCode) {
    alert("Lutfen bir hat kodu girin!");
    return;
  }

  busTableBody.appendChild(createBusRow(busCode));
  busCodeInputEl.value = "";
  busCodeInputEl.focus();

  const updatedBusCodes= [...new Set(getBusCodesFromTable(busTableBody))];

  localStorage.setItem("busCodes", JSON.stringify(updatedBusCodes))
}

busTableBtnEl.addEventListener("click", () => {
  addBusFromInput();
});

busCodeInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  addBusFromInput();
});

busCodeInputEl.addEventListener("input", () => {
  busCodeInputEl.value = normalizeBusCode(busCodeInputEl.value);
});

busTableBody.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const removeButton = target.closest("button[data-remove-row]");

  if (!(removeButton instanceof HTMLButtonElement)) {
    return;
  }

  const row = removeButton.closest("tr");

  if (row instanceof HTMLTableRowElement) {
    row.remove();
    const uniqueBusCodes = [...new Set(getBusCodesFromTable(busTableBody))];
    localStorage.setItem("busCodes", JSON.stringify(uniqueBusCodes))
  }
});

//----------------------------------------------------------------

function updateBusTimesTable(resp: BusRoutesResponse): void {
  for (const row of Array.from(busTableBody.rows)) {
    const codeCell = row.cells.item(0);
    const firstCell = row.cells.item(1);
    const secondCell = row.cells.item(2);

    if (!codeCell || !firstCell || !secondCell) continue;

    const code = normalizeBusCode(codeCell.textContent ?? "");
    if (!code) continue;

    const t = resp.times[code];
    const e = resp.errors[code];

    if (t) {
      firstCell.textContent = t.timeRemaining;
      secondCell.textContent = t.secondTimeReamining;
      firstCell.title = "";
      secondCell.title = "";
      continue;
    }

    if (e) {
      // show something useful in the table for failures
      firstCell.textContent = "No bussy bus bus";
      secondCell.textContent = "No bussy bus bus";
      firstCell.title = e.message;
      secondCell.title = e.message;
      continue;
    }

    // no data returned for this code (shouldn't happen if backend is correct)
    firstCell.textContent = "-";
    secondCell.textContent = "-";
    firstCell.title = "No data";
    secondCell.title = "No data";
  }
}

function updateAnnouncementsTable(announcements: announcementInfo[]): void {
  announcementTableBody.replaceChildren();

  if (announcements.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.textContent = "Duyuru yok";
    row.appendChild(cell);
    announcementTableBody.appendChild(row);
    return;
  }

  for (const item of announcements) {
    const row = document.createElement("tr");
    const busCodeCell = document.createElement("td");
    const messageCell = document.createElement("td");

    busCodeCell.textContent = normalizeBusCode(item.HATKODU);
    messageCell.textContent = item.MESAJ;

    row.append(busCodeCell, messageCell);
    announcementTableBody.appendChild(row);
  }
}

departureTimeBtnEl.addEventListener("click", async () => {
  //[TODO] Check the table
  /*
  if (
    !(firstDT instanceof HTMLElement) ||
    !(secondDT instanceof HTMLElement) ||
    !(announcementText instanceof HTMLElement)
  ) {
    alert("Saat/duyuru alanlari bulunamadi.");
    return;
  } 
  */

  const busCodes = [...new Set(getBusCodesFromTable(busTableBody))];

  if(busCodes.length === 0){
    alert("No bus codes provided");
    return;
  }

  try{
    const response: Response = await fetch("/otobus/routes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ busCodes }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
    }

    const data: unknown = await response.json();

    if (!isBusRoutesResponse(data)) {
      throw new Error("Bad response shape");
    }

    updateBusTimesTable(data);

    updateAnnouncementsTable(data.announcements);

  } catch(error: unknown) {
    const message = error instanceof Error ? error.message : " was";
    alert(`Front end error: ${message}`);
  }

  /*
  try {
    const response = await fetch(`/bus/${encodeURIComponent(busCode)}`);

    if (!response.ok) {
      throw new Error(`Sunucu hatasi: ${response.status}`);
    }

    const responseJson = (await response.json()) as BusResponse;
    const firstTime = responseJson.timeRemaining ?? "Bilinmiyor";
    const secondTime = responseJson.secondTimeReamining ?? "Bilinmiyor";
    const announcements = responseJson.announcement ?? [];

    firstDT.textContent = `First: ${firstTime}`;
    secondDT.textContent = `Then: ${secondTime}`;

    if (announcements.length === 0) {
      announcementText.innerHTML = "<p>Duyuru yok</p>";
      return;
    }

    announcementText.innerHTML = announcements
      .map((item) => `<p>${item.MESAJ ?? ""}</p>`)
      .join("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    alert(`Hata: ${message}`);
  }
  */
});

const savedBusCodes: string | null = localStorage.getItem("busCodes");

const parsedBusCodes: string[] = savedBusCodes
  ? JSON.parse(savedBusCodes)
  : [];

try{
  parsedBusCodes.forEach((busCode) => {
    busTableBody.appendChild(createBusRow(busCode));
  });
} catch(err: unknown) {
  alert("Bruh wtf you mean")
}
