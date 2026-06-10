from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import random
import json
from typing import Dict, Set
import uuid

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# Хранилище комнат
class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}  # code -> {players: {socket_id: data}, host_socket: id}
        self.socket_room: Dict[str, str] = {}  # socket_id -> room_code

    def generate_code(self) -> str:
        while True:
            part1 = random.randint(100, 999)
            part2 = random.randint(100, 999)
            code = f"{part1}-{part2}"
            if code not in self.rooms:
                return code

    def create_room(self, code: str, host_socket_id: str, host_name: str = "Хост") -> Dict:
        self.rooms[code] = {
            "players": {},
            "host_socket": host_socket_id,
            "host_name": host_name
        }
        return self.rooms[code]

    def join_room(self, code: str, socket_id: str, player_data: dict) -> bool:
        if code not in self.rooms:
            return False
        self.rooms[code]["players"][socket_id] = player_data
        self.socket_room[socket_id] = code
        return True

    def leave_room(self, socket_id: str):
        if socket_id in self.socket_room:
            code = self.socket_room[socket_id]
            if code in self.rooms:
                # Удаляем игрока
                if socket_id in self.rooms[code]["players"]:
                    del self.rooms[code]["players"][socket_id]

                # Если ушёл хост и есть другие игроки -> новый хост
                if socket_id == self.rooms[code].get("host_socket"):
                    if len(self.rooms[code]["players"]) > 0:
                        new_host = list(self.rooms[code]["players"].keys())[0]
                        self.rooms[code]["host_socket"] = new_host
                        self.rooms[code]["host_name"] = self.rooms[code]["players"][new_host]["name"]
                    else:
                        # Комната пуста - удаляем
                        del self.rooms[code]

            del self.socket_room[socket_id]

    def get_players_list(self, code: str) -> list:
        if code not in self.rooms:
            return []
        return [{"name": p["name"], "avatar": p["avatar"], "is_host": (sid == self.rooms[code].get("host_socket"))}
                for sid, p in self.rooms[code]["players"].items()]

    def room_exists(self, code: str) -> bool:
        return code in self.rooms

    def get_host_socket(self, code: str):
        if code in self.rooms:
            return self.rooms[code].get("host_socket")
        return None


room_manager = RoomManager()

# Хранилище WebSocket соединений
connections: Dict[str, Set[WebSocket]] = {}


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/create_room")
async def create_room():
    """Создаёт комнату и возвращает код"""
    code = room_manager.generate_code()
    return {"code": code}


@app.get("/api/room/{code}/exists")
async def room_exists(code: str):
    return {"exists": room_manager.room_exists(code)}


@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await websocket.accept()
    socket_id = str(id(websocket))

    # Сохраняем соединение
    if room_code not in connections:
        connections[room_code] = set()
    connections[room_code].add(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "create_room":
                # ПК создаёт комнату
                player_name = message.get("name", "Хост")
                avatar_seed = player_name + str(random.randint(1, 10000))
                player_data = {
                    "name": player_name,
                    "device": "pc",
                    "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}"
                }
                room_manager.create_room(room_code, socket_id, player_name)
                room_manager.join_room(room_code, socket_id, player_data)

                await websocket.send_text(json.dumps({
                    "type": "room_created",
                    "code": room_code
                }))

            elif message["type"] == "join":
                # Игрок (телефон) подключается к комнате
                player_name = message.get("name", "Игрок")
                avatar_seed = player_name + str(random.randint(1, 10000))
                player_data = {
                    "name": player_name,
                    "device": message.get("device", "mobile"),
                    "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}"
                }

                if room_manager.join_room(room_code, socket_id, player_data):
                    await websocket.send_text(json.dumps({
                        "type": "joined",
                        "code": room_code,
                        "name": player_name
                    }))

                    # Рассылаем обновленный список всем в комнате
                    await broadcast_to_room(room_code, {
                        "type": "players_update",
                        "players": room_manager.get_players_list(room_code)
                    })
                else:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "Комната не найдена"
                    }))

            elif message["type"] == "get_players":
                # Запрос списка игроков
                await websocket.send_text(json.dumps({
                    "type": "players_update",
                    "players": room_manager.get_players_list(room_code)
                }))

    except WebSocketDisconnect:
        connections[room_code].discard(websocket)
        room_manager.leave_room(socket_id)

        # Рассылаем обновленный список оставшимся
        await broadcast_to_room(room_code, {
            "type": "players_update",
            "players": room_manager.get_players_list(room_code)
        })


async def broadcast_to_room(room_code: str, message: dict, exclude_socket: WebSocket = None):
    """Расслылка сообщения всем в комнате"""
    if room_code in connections:
        for conn in connections[room_code]:
            if conn != exclude_socket:
                try:
                    await conn.send_text(json.dumps(message))
                except:
                    pass