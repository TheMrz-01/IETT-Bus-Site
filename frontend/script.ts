const busCodeInput = document.getElementById("busCodeInput");

const departureTimeBtn = document.getElementById("departureTimeBtn");

const firstDT = document.querySelector(".timeContainer #firstDT");
const secondDT = document.querySelector(".timeContainer #secondDT");

const announcementText = document.getElementById("announcementText");

departureTimeBtn.addEventListener("click", async () => {
    const busCode = busCodeInput.value.trim();
    
    if (!busCode) {
        alert("Lütfen bir hat kodu girin!");
        return;
    }
    
    try {
        const response = await fetch(`/bus/${encodeURIComponent(busCode)}`);
        const responseJson = await response.json(); 

        firstDT.textContent = "First: " + responseJson.timeRemaining;
        secondDT.textContent = "Then: " + responseJson.secondTimeReamining;

        if (responseJson.announcement.length === 0) {
            announcementText.innerHTML = `<p>Duyuru yok</p>`;
        } else {
            announcementText.innerHTML = responseJson.announcement
                .map(a => `<p>${a.MESAJ}</p>`)
                .join("");
        }
    } catch (err) {
        alert("Hata: " + err.message);
    }
});