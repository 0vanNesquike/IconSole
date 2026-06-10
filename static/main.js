const connectBtn = document.getElementById("connectBtn");

connectBtn?.addEventListener("click", async () => {
    const response = await fetch('/api/create_room');
    const data = await response.json();
    const roomCode = data.code;

    // Перенаправляем на страницу комнаты
    window.location.href = `/room?code=${roomCode}`;
});

// Остальные функции для главной страницы при необходимости