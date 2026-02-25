type AnnouncementItem = {
  MESAJ?: string;
};

type BusResponse = {
  timeRemaining?: string;
  secondTimeReamining?: string;
  announcement?: AnnouncementItem[];
};

function getBusCodesFromTable(body: HTMLTableSectionElement): string[] {
  return Array.from(body.rows)
    .map((row) => normalizeBusCode(row.cells[0]?.textContent ?? ""))
    .filter((code) => code.length > 0);
}


const busCodeInput = document.getElementById("busCodeInput");
const busTableBtn = document.getElementById("busTableBtn");
const departureTimeBtn = document.getElementById("departureTimeBtn");
const announcementText = document.getElementById("announcementText");
const busTable = document.querySelector(".busTable");

if (
  !(busCodeInput instanceof HTMLInputElement) ||
  !(busTableBtn instanceof HTMLButtonElement) ||
  !(departureTimeBtn instanceof HTMLButtonElement) ||
  !(busTable instanceof HTMLTableElement)
) {
  throw new Error("Required DOM elements were not found");
}

const busCodeInputEl = busCodeInput;
const busTableBtnEl = busTableBtn;
const departureTimeBtnEl = departureTimeBtn;
const busTableEl = busTable;

const busTableBody = busTableEl.tBodies.item(0) ?? busTableEl.createTBody();

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
  const busCode = normalizeBusCode(busCodeInputEl.value);

  const uniqueBusCodes = [...new Set(getBusCodesFromTable(busTableBody))];

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

  try{
    let busCodes = [...new Set(getBusCodesFromTable(busTableBody))];

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
    console.log(data);

    //[TODO]: Display results

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