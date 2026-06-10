from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import random
import json
from typing import Dict, List
import asyncio

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# Хранилище комнат
class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}  # code -> {players: {socket_id: data}, game_state: dict}
        self.socket_room: Dict[str, str] = {}  # socket_id -> room_code

    def create_room(self, code: str):
        if code not in self.rooms:
            self.rooms[code] = {
                "players": {},
                "game_active": False,
                "paddle1_y": 250,
                "paddle2_y": 250,
                "ball_x": 400,
                "ball_y": 300,
                "score1": 0,
                "score2": 0
            }
        return self.rooms[code]

    def join_room(self, code: str, socket_id: str, player_data: dict):
        if code not in self.rooms:
            self.create_room(code)
        self.rooms[code]["players"][socket_id] = player_data
        self.socket_room[socket_id] = code
        return self.get_players_list(code)

    def leave_room(self, socket_id: str):
        if socket_id in self.socket_room:
            code = self.socket_room[socket_id]
            if code in self.rooms and socket_id in self.rooms[code]["players"]:
                del self.rooms[code]["players"][socket_id]
            del self.socket_room[socket_id]

    def get_players_list(self, code: str) -> List[dict]:
        if code not in self.rooms:
            return []
        return [{"name": p["name"], "avatar": p["avatar"]} for p in self.rooms[code]["players"].values()]

    def get_game_state(self, code: str):
        if code in self.rooms:
            state = self.rooms[code]
            return {
                "paddle1": state["paddle1_y"],
                "paddle2": state["paddle2_y"],
                "ball": {"x": state["ball_x"], "y": state["ball_y"]},
                "score1": state["score1"],
                "score2": state["score2"]
            }
        return None


room_manager = RoomManager()

# Хранилище WebSocket соединений для рассылки
connections: Dict[str, List[WebSocket]] = {}


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.websocket("/ws/{room_code}/{player_name}/{device_type}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_name: str, device_type: str):
    await websocket.accept()
    socket_id = str(id(websocket))

    # Сохраняем соединение
    if room_code not in connections:
        connections[room_code] = []
    connections[room_code].append(websocket)

    # Генерация аватара
    avatar_seed = player_name + str(random.randint(1, 1000))
    player_data = {
        "name": player_name,
        "device": device_type,
        "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}"
    }

    # Добавляем в комнату
    room_manager.join_room(room_code, socket_id, player_data)

    # Рассылаем обновленный список игроков
    await broadcast_to_room(room_code, {
        "type": "players_update",
        "players": room_manager.get_players_list(room_code)
    })

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "game_start":
                room_manager.rooms[room_code]["game_active"] = True
                await broadcast_to_room(room_code, {"type": "game_started"})

                # Запускаем игровой цикл
                asyncio.create_task(game_loop(room_code))

            elif message["type"] == "move":
                # Движение от телефона
                if device_type == "mobile":
                    room_manager.rooms[room_code]["paddle1_y"] += message["y"] * 20
                    # Ограничение
                    room_manager.rooms[room_code]["paddle1_y"] = max(0, min(500,
                                                                            room_manager.rooms[room_code]["paddle1_y"]))

                    # Отправляем обновленное состояние всем
                    await broadcast_to_room(room_code, {
                        "type": "game_state",
                        "state": room_manager.get_game_state(room_code)
                    })

            elif message["type"] == "pc_move":
                # Движение от ПК (для тестирования)
                room_manager.rooms[room_code]["paddle2_y"] += message["y"] * 20
                room_manager.rooms[room_code]["paddle2_y"] = max(0,
                                                                 min(500, room_manager.rooms[room_code]["paddle2_y"]))
                await broadcast_to_room(room_code, {
                    "type": "game_state",
                    "state": room_manager.get_game_state(room_code)
                })

    except WebSocketDisconnect:
        connections[room_code].remove(websocket)
        room_manager.leave_room(socket_id)
        await broadcast_to_room(room_code, {
            "type": "players_update",
            "players": room_manager.get_players_list(room_code)
        })


async def broadcast_to_room(room_code: str, message: dict):
    """Расслылка сообщения всем в комнате"""
    if room_code in connections:
        for conn in connections[room_code]:
            try:
                await conn.send_text(json.dumps(message))
            except:
                pass


async def game_loop(room_code: str):
    """Игровой цикл для Pong"""
    import time
    room = room_manager.rooms[room_code]
    vx, vy = 5, 3

    while room["game_active"]:
        # Обновляем мяч
        room["ball_x"] += vx
        room["ball_y"] += vy

        # Отскок от стен
        if room["ball_y"] <= 0 or room["ball_y"] >= 600:
            vy *= -1

        # Отскок от ракеток
        if room["ball_x"] <= 20 and room["paddle1_y"] - 50 < room["ball_y"] < room["paddle1_y"] + 50:
            vx *= -1
        elif room["ball_x"] >= 780 and room["paddle2_y"] - 50 < room["ball_y"] < room["paddle2_y"] + 50:
            vx *= -1

        # Голы
        if room["ball_x"] < 0:
            room["score2"] += 1
            room["ball_x"], room["ball_y"] = 400, 300
            vx *= -1
        elif room["ball_x"] > 800:
            room["score1"] += 1
            room["ball_x"], room["ball_y"] = 400, 300
            vx *= -1

        # Отправляем состояние
        await broadcast_to_room(room_code, {
            "type": "game_state",
            "state": room_manager.get_game_state(room_code)
        })

        await asyncio.sleep(0.016)  # ~60 FPS