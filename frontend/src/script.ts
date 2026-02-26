type AnnouncementItem = {
  MESAJ?: string;
};

type BusResponse = {
  timeRemaining?: string;
  secondTimeReamining?: string;
  announcement?: AnnouncementItem[];
};

//TEMP TYPE
type AnnouncementInfo = {
  "HATKODU": string;
  "MESAJ": string;
};

type AnnouncementResponse = {
  "announcements": AnnouncementInfo[]
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAnnouncementInfo(value: unknown): value is AnnouncementInfo {
  return (
    isRecord(value) &&
    typeof value.HATKODU === "string" &&
    typeof value.MESAJ === "string"
  );
}
function isAnnouncementResponse(value: unknown): value is AnnouncementResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.announcements) &&
    value.announcements.every(isAnnouncementInfo)
  );
}

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
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
    localStorage.removeItem("busCodes");
    const uniqueBusCodes = [...new Set(getBusCodesFromTable(busTableBody))];
    localStorage.setItem("busCodes", JSON.stringify(uniqueBusCodes))
  }
});

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

  let busCodes = [...new Set(getBusCodesFromTable(busTableBody))];

  if(busCodes.length === 0){
    alert("No bus codes provided");
    return;
  }

  try{
    const response: Response = await fetch("/bus/routes", {
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

    announcementTableBody.replaceChildren();

    if (isAnnouncementResponse(data)) {
      if (data.announcements.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 2;
        cell.textContent = "Duyuru yok";

        row.appendChild(cell);
        announcementTableBody.appendChild(row);
      } else {
        data.announcements.forEach((item) => {
          const row = document.createElement("tr");
          const busCodeCell = document.createElement("td");
          const messageCell = document.createElement("td");

          busCodeCell.textContent = normalizeBusCode(item.HATKODU);
          messageCell.textContent = item.MESAJ;

          row.append(busCodeCell, messageCell);
          announcementTableBody.appendChild(row);
        });
      }
    } else {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 2;
      cell.textContent = "Beklenmeyen duyuru formati";

      row.appendChild(cell);
      
      announcementTableBody.appendChild(row);
    }

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

parsedBusCodes.forEach((busCode) => {
  busTableBody.appendChild(createBusRow(busCode));
});
