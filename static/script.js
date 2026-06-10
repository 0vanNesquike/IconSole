const pc = document.getElementById("pc-screen");
const mobile = document.getElementById("mobile-screen");

const room = document.getElementById("room");
const connectBtn = document.getElementById("connectBtn");
const connectPcContainer = document.getElementById("connect-pc-container");
const codeEl = document.getElementById("code");
const qr = document.getElementById("qr");

const playersEl = document.getElementById("players");
const continueBtn = document.getElementById("continueBtn");
const joinBtn = document.getElementById("joinBtn");

const gameLobby = document.getElementById("game-lobby");
const categoriesSections = document.getElementById("categories-sections");
const roomInfoBtn = document.getElementById("room-info-btn");
const roomInfoTooltip = document.getElementById("room-info-tooltip");
const lobbyQr = document.getElementById("lobby-qr");
const lobbyCode = document.getElementById("lobby-code");
const featuredPlayBtn = document.getElementById("featured-play-btn");

// Мобильные элементы
const mobileNameInput = document.getElementById("name");
const mobileCodeInput = document.getElementById("roomCode");
const mobileJoinBtn = document.getElementById("joinBtn");

let roomCode = null;
let players = [];
let selectedGameId = null;
let selectedGameData = null;
let ws = null;

let currentCategoryIndex = 0;
let currentGameInCategory = 0;
let categoryElements = [];
let isAnimating = false;

// Определяем устройство
const isMobile = window.innerWidth < 768;

if (isMobile) {
    pc.style.display = "none";
    mobile.style.display = "flex";

    // Получаем код комнаты из URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        mobileCodeInput.value = roomFromUrl;
    }
} else {
    pc.style.display = "flex";
    mobile.style.display = "none";
}

const CATEGORIES = [
    {
        id: "free",
        title: "Бесплатные игры",
        games: [
            { id: 1, name: "Pong Classic", desc: "Классический пинг-понг", preview: "https://assets.mixkit.co/videos/preview/mixkit-pong-game-2215-large.mp4", tags: ["аркада"] },
            { id: 2, name: "Snake Multi", desc: "Змейка с друзьями", preview: "", tags: ["мультиплеер"] },
            { id: 3, name: "Runner 2D", desc: "Бесконечный бегун", preview: "", tags: ["одиночная"] }
        ]
    },
    {
        id: "weekly",
        title: "Игры недели",
        games: [
            { id: 7, name: "Space Arena", desc: "Космические PvP бои", preview: "https://assets.mixkit.co/videos/preview/mixkit-space-game-background-2356-large.mp4", tags: ["экшен", "мультиплеер"] },
            { id: 1, name: "Pong Classic", desc: "Классический пинг-понг", preview: "https://assets.mixkit.co/videos/preview/mixkit-pong-game-2215-large.mp4", tags: ["аркада"] }
        ]
    },
    {
        id: "board",
        title: "Настольные игры",
        games: [
            { id: 4, name: "Шахматы", desc: "Классические шахматы", preview: "", tags: ["настольные", "2 игрока"] },
            { id: 5, name: "Шашки", desc: "Русские шашки", preview: "", tags: ["настольные"] },
            { id: 6, name: "Нарды", desc: "Короткие нарды", preview: "", tags: ["настольные"] }
        ]
    },
    {
        id: "popular",
        title: "Популярные игры",
        games: [
            { id: 1, name: "Pong Classic", desc: "Классический пинг-понг", preview: "https://assets.mixkit.co/videos/preview/mixkit-pong-game-2215-large.mp4", tags: ["аркада"] },
            { id: 7, name: "Space Arena", desc: "Космические PvP бои", preview: "https://assets.mixkit.co/videos/preview/mixkit-space-game-background-2356-large.mp4", tags: ["экшен"] },
            { id: 2, name: "Snake Multi", desc: "Змейка с друзьями", preview: "", tags: ["мультиплеер"] }
        ]
    },
    {
        id: "multi",
        title: "Мультиплеер",
        games: [
            { id: 1, name: "Pong Classic", desc: "Классический пинг-понг", preview: "https://assets.mixkit.co/videos/preview/mixkit-pong-game-2215-large.mp4", tags: ["2 игрока"] },
            { id: 2, name: "Snake Multi", desc: "Змейка с друзьями", preview: "", tags: ["до 4 игроков"] },
            { id: 7, name: "Space Arena", desc: "Космические PvP бои", preview: "https://assets.mixkit.co/videos/preview/mixkit-space-game-background-2356-large.mp4", tags: ["до 8 игроков"] }
        ]
    },
    {
        id: "single",
        title: "Одиночные игры",
        games: [
            { id: 3, name: "Runner 2D", desc: "Бесконечный бегун", preview: "", tags: ["одиночная"] },
            { id: 8, name: "Tank Battle", desc: "Танковые сражения с ботами", preview: "", tags: ["с ботами"] }
        ]
    }
];

// ===================== ПК ЛОГИКА =====================
if (!isMobile) {
    connectBtn?.addEventListener("click", async () => {
        // Создаём комнату на сервере
        const response = await fetch('/api/create_room');
        const data = await response.json();
        roomCode = data.code;

        codeEl.textContent = roomCode;

        // QR ведёт на этот же сайт с параметром комнаты
        const mobileUrl = `${window.location.origin}?room=${roomCode}`;
        qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;

        connectPcContainer.classList.add("hidden");
        room.classList.remove("hidden");

        // Подключаем WebSocket и создаём комнату
        connectWebSocket(roomCode, "Хост", "pc", true);
    });
}

// ===================== МОБИЛЬНАЯ ЛОГИКА =====================
if (isMobile) {
    mobileJoinBtn?.addEventListener("click", async () => {
        const code = mobileCodeInput.value.trim();
        const name = mobileNameInput.value.trim() || "Игрок";

        if (!code) {
            alert("Введите код комнаты");
            return;
        }

        // Проверяем существование комнаты
        const response = await fetch(`/api/room/${code}/exists`);
        const data = await response.json();

        if (!data.exists) {
            alert("Комната не найдена");
            return;
        }

        // Подключаем WebSocket
        connectWebSocket(code, name, "mobile", false);

        // Показываем интерфейс ожидания
        const mobileContainer = document.querySelector('.mobile-container');
        mobileContainer.innerHTML = `
            <h1>◉ IconSole</h1>
            <p style="color:#00e676; margin:20px">✓ Подключение к комнате ${code}...</p>
            <p>Игрок: ${escapeHtml(name)}</p>
            <div id="mobileWaitStatus" style="margin-top:20px; color:#ffd166">Ожидание подключения...</div>
            <button id="mobileDisconnect" style="margin-top:30px; background:#ff4757">Отключиться</button>
        `;

        document.getElementById("mobileDisconnect")?.addEventListener("click", () => {
            if (ws) ws.close();
            location.reload();
        });
    });
}

// ===================== WEB-SOCKET ЛОГИКА =====================
function connectWebSocket(code, playerName, deviceType, isCreatingRoom) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${code}`);

    ws.onopen = () => {
        console.log('WebSocket connected');

        if (isCreatingRoom) {
            // ПК создаёт комнату
            ws.send(JSON.stringify({ type: "create_room", name: playerName, device: deviceType }));
        } else {
            // Телефон подключается к комнате
            ws.send(JSON.stringify({ type: "join", name: playerName, device: deviceType }));
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Message:', data);

        if (data.type === "room_created") {
            console.log('Room created:', data.code);
            // Запрашиваем список игроков
            ws.send(JSON.stringify({ type: "get_players" }));
        }

        if (data.type === "joined") {
            console.log('Joined room:', data.code);
            if (isMobile) {
                const waitStatus = document.getElementById("mobileWaitStatus");
                if (waitStatus) {
                    waitStatus.innerHTML = "✓ Подключено! Ожидаем начала игры...";
                    waitStatus.style.color = "#00e676";
                }
            }
        }

        if (data.type === "players_update" && !isMobile) {
            // Обновляем список игроков на ПК
            playersEl.innerHTML = '';
            players = data.players;
            players.forEach(player => {
                const div = document.createElement("div");
                div.className = "player";
                const hostBadge = player.is_host ? ' <span style="font-size:10px; color:#ffd166">(хост)</span>' : '';
                div.innerHTML = `<img src="${player.avatar}"><span>${escapeHtml(player.name)}${hostBadge}</span>`;
                playersEl.appendChild(div);
            });
            if (players.length > 0) {
                continueBtn.classList.remove("hidden");
            }
            updateLobbyPlayerCount();
        }

        if (data.type === "error") {
            alert(data.message);
            if (isMobile) {
                location.reload();
            }
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (!isMobile) {
            alert("Ошибка подключения к серверу");
        }
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
        if (!isMobile && roomCode) {
            // Если хост отключается, комната удаляется
            alert("Соединение разорвано");
        }
    };
}

// ===================== ОСТАЛЬНЫЕ ФУНКЦИИ (ПК ЛОББИ) =====================
function renderAllCategories() {
    categoriesSections.innerHTML = '';
    categoryElements = [];

    const categoriesContainer = document.createElement('div');
    categoriesContainer.className = 'categories-container';

    CATEGORIES.forEach((category, catIdx) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'category-page';
        pageDiv.dataset.categoryIndex = catIdx;
        if (catIdx !== 0) pageDiv.style.display = 'none';

        const section = document.createElement('div');
        section.className = 'category-section';
        section.innerHTML = `<div class="category-title">${escapeHtml(category.title)}</div><div class="games-horizontal"></div>`;

        const gamesContainer = section.querySelector('.games-horizontal');
        const gameCards = [];

        category.games.forEach((game, gameIdx) => {
            const card = document.createElement('div');
            card.className = `game-card ${selectedGameId === game.id ? 'selected' : ''}`;
            card.setAttribute('tabindex', '-1');
            card.dataset.id = game.id;
            card.dataset.categoryIndex = catIdx;
            card.dataset.gameIndex = gameIdx;
            card.innerHTML = `
                <div class="game-preview-small">
                    ${game.preview ? `<video muted loop playsinline src="${game.preview}"></video>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#1a1a2e;color:#4f8cff;font-size:24px;">🎮</div>`}
                </div>
                <h4>${escapeHtml(game.name)}</h4>
                <p>${escapeHtml(game.desc)}</p>
                <div class="game-tags">${game.tags.map(t => `<span class="game-tag">${escapeHtml(t)}</span>`).join('')}</div>
            `;
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                setFocusToGame(catIdx, gameIdx);
            });
            const video = card.querySelector('video');
            if (video) card.addEventListener('mouseenter', () => video.play());
            gamesContainer.appendChild(card);
            gameCards.push(card);
        });

        pageDiv.appendChild(section);
        categoriesContainer.appendChild(pageDiv);

        categoryElements.push({
            title: category.title,
            gameCards,
            games: category.games,
            container: pageDiv
        });
    });

    categoriesSections.appendChild(categoriesContainer);

    const indicator = document.createElement('div');
    indicator.className = 'category-indicator';
    CATEGORIES.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.className = `category-dot ${idx === 0 ? 'active' : ''}`;
        dot.addEventListener('click', () => switchToCategory(idx));
        indicator.appendChild(dot);
    });
    categoriesSections.appendChild(indicator);

    if (categoryElements.length > 0 && categoryElements[0].gameCards.length > 0) {
        setFocusToGameInCurrentCategory(0);
    }

    updateFeaturedByCurrentCategory();
}

function switchToCategory(newIndex, directionArrow = null) {
    if (isAnimating || newIndex === currentCategoryIndex) return;

    let targetIndex = newIndex;
    if (targetIndex < 0) targetIndex = categoryElements.length - 1;
    if (targetIndex >= categoryElements.length) targetIndex = 0;

    isAnimating = true;

    const currentPage = categoryElements[currentCategoryIndex].container;
    const nextPage = categoryElements[targetIndex].container;

    let isDown;
    if (directionArrow === 'up') {
        isDown = false;
    } else if (directionArrow === 'down') {
        isDown = true;
    } else {
        isDown = targetIndex > currentCategoryIndex;
    }

    if (isDown) {
        currentPage.classList.add('hide-down');
    } else {
        currentPage.classList.add('hide-up');
    }

    setTimeout(() => {
        currentPage.style.display = 'none';
        currentPage.classList.remove('hide-up', 'hide-down');

        nextPage.style.display = 'block';
        nextPage.classList.remove('show-up', 'show-down');

        if (isDown) {
            nextPage.classList.add('show-down');
        } else {
            nextPage.classList.add('show-up');
        }

        currentCategoryIndex = targetIndex;

        document.querySelectorAll('.category-dot').forEach((dot, idx) => {
            if (idx === currentCategoryIndex) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        updateFeaturedByCurrentCategory();

        if (categoryElements[currentCategoryIndex].gameCards.length > 0) {
            setFocusToGameInCurrentCategory(0);
        }

        setTimeout(() => {
            nextPage.classList.remove('show-up', 'show-down');
            isAnimating = false;
        }, 50);
    }, 250);
}

function updateFeaturedByCurrentCategory() {
    if (!categoryElements[currentCategoryIndex] || !categoryElements[currentCategoryIndex].games.length) return;
    const firstGame = categoryElements[currentCategoryIndex].games[0];
    if (firstGame) {
        updateFeaturedGame(firstGame);
        selectedGameId = firstGame.id;
        selectedGameData = firstGame;
    }
}

function setFocusToGame(catIdx, gameIdx) {
    if (catIdx !== currentCategoryIndex) {
        switchToCategory(catIdx);
        setTimeout(() => {
            setFocusToGameInCurrentCategory(gameIdx);
        }, 300);
    } else {
        setFocusToGameInCurrentCategory(gameIdx);
    }
}

function setFocusToGameInCurrentCategory(gameIdx) {
    if (gameIdx < 0 || gameIdx >= categoryElements[currentCategoryIndex].gameCards.length) return;

    categoryElements.forEach(cat => {
        cat.gameCards.forEach(card => card.classList.remove('selected'));
    });

    const targetCard = categoryElements[currentCategoryIndex].gameCards[gameIdx];
    targetCard.classList.add('selected');
    targetCard.focus({ preventScroll: true });
    currentGameInCategory = gameIdx;
    selectedGameId = categoryElements[currentCategoryIndex].games[gameIdx].id;
    selectedGameData = categoryElements[currentCategoryIndex].games[gameIdx];
    updateFeaturedGame(selectedGameData);

    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function setFocusToFeaturedBtn() {
    featuredPlayBtn.focus({ preventScroll: true });
}

function setFocusToRoomBtn() {
    roomInfoBtn.focus({ preventScroll: true });
}

function updateFeaturedGame(game) {
    const featuredTitle = document.getElementById("featured-title");
    const featuredDesc = document.getElementById("featured-description");
    const featuredVideo = document.getElementById("featured-video");
    const featuredTag = document.getElementById("featured-tag");

    const featuredInfo = document.querySelector('.featured-info');
    const featuredVideoElem = document.querySelector('.featured-video');

    if (featuredInfo) featuredInfo.style.transition = 'opacity 0.15s';
    if (featuredVideoElem) featuredVideoElem.style.transition = 'opacity 0.15s';
    if (featuredInfo) featuredInfo.style.opacity = '0.3';
    if (featuredVideoElem) featuredVideoElem.style.opacity = '0.3';

    setTimeout(() => {
        if (featuredTitle) featuredTitle.textContent = game.name;
        if (featuredDesc) featuredDesc.textContent = game.desc;
        if (featuredTag) featuredTag.textContent = "Актуальное";
        if (featuredVideo && game.preview) {
            featuredVideo.innerHTML = `<source src="${game.preview}" type="video/mp4">`;
            featuredVideo.load();
            featuredVideo.play();
        }

        if (featuredInfo) featuredInfo.style.opacity = '1';
        if (featuredVideoElem) featuredVideoElem.style.opacity = '1';
    }, 100);
}

function updateLobbyPlayerCount() {
    const span = document.getElementById("lobby-player-count");
    if (span) span.textContent = players.length;
}

function launchSelectedGame() {
    if (selectedGameData) alert("Запуск игры: " + selectedGameData.name);
    else alert("Выберите игру из списка");
}

function navigateVertical(direction) {
    if (isAnimating) return;

    const active = document.activeElement;
    const isGame = active.classList && active.classList.contains("game-card");
    const isFeatured = active === featuredPlayBtn;
    const isRoom = active === roomInfoBtn;

    if (isGame) {
        if (direction === "up") {
            let newIndex = currentCategoryIndex - 1;
            if (newIndex < 0) newIndex = categoryElements.length - 1;
            switchToCategory(newIndex, 'up');
        } else if (direction === "down") {
            let newIndex = currentCategoryIndex + 1;
            if (newIndex >= categoryElements.length) newIndex = 0;
            switchToCategory(newIndex, 'down');
        }
    } else if (isFeatured) {
        if (direction === "up") {
            setFocusToRoomBtn();
        } else if (direction === "down") {
            setFocusToRoomBtn();
        }
    } else if (isRoom) {
        if (direction === "up") {
            setFocusToFeaturedBtn();
        } else if (direction === "down") {
            setFocusToFeaturedBtn();
        }
    }
}

function navigateHorizontal(direction) {
    const active = document.activeElement;
    if (!active.classList || !active.classList.contains("game-card")) return;

    let newIdx = currentGameInCategory;
    if (direction === "right") newIdx++;
    else if (direction === "left") newIdx--;

    const cat = categoryElements[currentCategoryIndex];
    if (newIdx >= 0 && newIdx < cat.gameCards.length) {
        setFocusToGameInCurrentCategory(newIdx);
    }
}

document.addEventListener("keydown", (e) => {
    if (!gameLobby || gameLobby.classList.contains('hidden')) return;

    switch (e.key) {
        case "ArrowUp":
            e.preventDefault();
            navigateVertical("up");
            break;
        case "ArrowDown":
            e.preventDefault();
            navigateVertical("down");
            break;
        case "ArrowLeft":
            e.preventDefault();
            navigateHorizontal("left");
            break;
        case "ArrowRight":
            e.preventDefault();
            navigateHorizontal("right");
            break;
        case "Tab":
            e.preventDefault();
            const active = document.activeElement;
            const isGame = active.classList && active.classList.contains("game-card");
            const isFeatured = active === featuredPlayBtn;

            if (isGame) {
                setFocusToFeaturedBtn();
            } else if (isFeatured) {
                if (categoryElements[currentCategoryIndex].gameCards.length > 0) {
                    setFocusToGameInCurrentCategory(currentGameInCategory);
                }
            } else {
                setFocusToFeaturedBtn();
            }
            break;
        case " ":
        case "Space":
            e.preventDefault();
            if (document.activeElement === featuredPlayBtn) {
                launchSelectedGame();
            } else if (document.activeElement.classList && document.activeElement.classList.contains("game-card")) {
                launchSelectedGame();
            } else if (document.activeElement === roomInfoBtn) {
                roomInfoBtn.click();
            }
            break;
    }
});

roomInfoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (roomInfoTooltip.classList.contains("hidden")) {
        if (lobbyQr && roomCode) {
            const mobileUrl = `${window.location.origin}?room=${roomCode}`;
            lobbyQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(mobileUrl)}`;
            lobbyCode.textContent = roomCode;
        }
        roomInfoTooltip.classList.remove("hidden");
    } else {
        roomInfoTooltip.classList.add("hidden");
    }
});

document.addEventListener("click", (e) => {
    if (roomInfoTooltip && !roomInfoTooltip.contains(e.target) && e.target !== roomInfoBtn) {
        roomInfoTooltip.classList.add("hidden");
    }
});

continueBtn.onclick = () => {
    room.classList.add("hidden");
    gameLobby.classList.remove("hidden");
    renderAllCategories();
    updateLobbyPlayerCount();

    if (document.activeElement) {
        document.activeElement.blur();
    }

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    setTimeout(() => {
        if (categoryElements.length > 0 && categoryElements[0].gameCards.length > 0) {
            const firstCard = categoryElements[0].gameCards[0];
            firstCard.classList.add('selected');
            firstCard.focus({ preventScroll: true });
            currentGameInCategory = 0;
        }

        document.body.style.cursor = 'none';
        gameLobby.style.cursor = 'none';
    }, 50);

    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
};

featuredPlayBtn?.addEventListener("click", launchSelectedGame);

let cursorTimeout;
document.addEventListener('mousemove', () => {
    if (!gameLobby || gameLobby.classList.contains('hidden')) return;

    document.body.style.cursor = '';
    gameLobby.style.cursor = '';

    clearTimeout(cursorTimeout);
    cursorTimeout = setTimeout(() => {
        if (gameLobby && !gameLobby.classList.contains('hidden')) {
            document.body.style.cursor = 'none';
            gameLobby.style.cursor = 'none';
        }
    }, 2000);
});

function escapeHtml(str) {
    return str.replace(/[&<>]/g, (m) => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

function createFireflies() {
    const container = document.getElementById("fireflies");
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 120; i++) {
        const fly = document.createElement("div");
        fly.className = "firefly";
        const size = 2 + Math.random() * 5;
        fly.style.width = size + "px";
        fly.style.height = size + "px";
        fly.style.left = Math.random() * 100 + "%";
        fly.style.top = Math.random() * 100 + "%";
        const duration = 6 + Math.random() * 15;
        const delay = Math.random() * 20;
        fly.style.animation = `floatFirefly ${duration}s linear infinite`;
        fly.style.animationDelay = delay + "s";
        fly.style.opacity = 0.3 + Math.random() * 0.7;
        container.appendChild(fly);
    }
}
createFireflies();

const cursorGlow = document.getElementById("cursor-glow");
document.addEventListener("mousemove", (e) => {
    if (cursorGlow) {
        cursorGlow.style.left = e.clientX + "px";
        cursorGlow.style.top = e.clientY + "px";
    }
});