// frontend/script.ts
var busCodeInput = document.getElementById("busCodeInput");
var departureTimeBtn = document.getElementById("departureTimeBtn");
var firstDT = document.querySelector(".timeContainer #firstDT");
var secondDT = document.querySelector(".timeContainer #secondDT");
var announcementText = document.getElementById("announcementText");
if (!(busCodeInput instanceof HTMLInputElement) || !(departureTimeBtn instanceof HTMLButtonElement) || !(firstDT instanceof HTMLElement) || !(secondDT instanceof HTMLElement) || !(announcementText instanceof HTMLElement)) {
  throw new Error("Required DOM elements were not found");
}
departureTimeBtn.addEventListener("click", async () => {
  const busCode = busCodeInput.value.trim();
  console.log(busCode);
  if (!busCode) {
    alert("Lutfen bir hat kodu girin!");
    return;
  }
  try {
    const response = await fetch(`/bus/${encodeURIComponent(busCode)}`);
    if (!response.ok) {
      throw new Error(`Sunucu hatasi: ${response.status}`);
    }
    const responseJson = await response.json();
    const firstTime = responseJson.timeRemaining ?? "Bilinmiyor";
    const secondTime = responseJson.secondTimeReamining ?? "Bilinmiyor";
    const announcements = responseJson.announcement ?? [];
    firstDT.textContent = `First: ${firstTime}`;
    secondDT.textContent = `Then: ${secondTime}`;
    if (announcements.length === 0) {
      announcementText.innerHTML = "<p>Duyuru yok</p>";
      return;
    }
    announcementText.innerHTML = announcements.map((item) => `<p>${item.MESAJ ?? ""}</p>`).join("");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    alert(`Hata: ${message}`);
  }
});
