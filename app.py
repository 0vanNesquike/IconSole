from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import random
import json
from typing import Dict, Set

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}
        self.socket_room: Dict[str, str] = {}

    def generate_code(self) -> str:
        while True:
            part1 = random.randint(100, 999)
            part2 = random.randint(100, 999)
            code = f"{part1}-{part2}"
            if code not in self.rooms:
                return code

    def create_room(self, code: str, host_socket_id: str = None, host_name: str = "Хост") -> Dict:
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
                if socket_id in self.rooms[code]["players"]:
                    del self.rooms[code]["players"][socket_id]
                if len(self.rooms[code]["players"]) == 0:
                    del self.rooms[code]
            del self.socket_room[socket_id]

    def get_players_list(self, code: str) -> list:
        if code not in self.rooms:
            return []
        return [{"name": p["name"], "avatar": p["avatar"]} for p in self.rooms[code]["players"].values()]

    def room_exists(self, code: str) -> bool:
        return code in self.rooms


room_manager = RoomManager()
connections: Dict[str, Set[WebSocket]] = {}


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/room", response_class=HTMLResponse)
async def get_room(request: Request, code: str = None):
    if not code:
        return RedirectResponse(url="/", status_code=302)
    if not room_manager.room_exists(code):
        room_manager.create_room(code)
    return templates.TemplateResponse("room.html", {"request": request})


@app.get("/api/create_room")
async def create_room():
    code = room_manager.generate_code()
    room_manager.create_room(code)
    return {"code": code}


@app.get("/api/room/{code}/exists")
async def room_exists(code: str):
    return {"exists": room_manager.room_exists(code)}


@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await websocket.accept()
    socket_id = str(id(websocket))

    if room_code not in connections:
        connections[room_code] = set()
    connections[room_code].add(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "create_room":
                player_name = message.get("name", "Хост")
                avatar_seed = player_name + str(random.randint(1, 10000))
                player_data = {
                    "name": player_name,
                    "device": "pc",
                    "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}"
                }
                room_manager.join_room(room_code, socket_id, player_data)
                room_manager.rooms[room_code]["host_socket"] = socket_id

                await websocket.send_text(json.dumps({
                    "type": "room_created",
                    "code": room_code
                }))

                await broadcast_to_room(room_code, {
                    "type": "players_update",
                    "players": room_manager.get_players_list(room_code)
                })

            elif message["type"] == "join":
                player_name = message.get("name", "Игрок")
                avatar_seed = player_name + str(random.randint(1, 10000))
                player_data = {
                    "name": player_name,
                    "device": "mobile",
                    "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={avatar_seed}"
                }

                if room_manager.join_room(room_code, socket_id, player_data):
                    await websocket.send_text(json.dumps({
                        "type": "joined",
                        "code": room_code,
                        "name": player_name
                    }))

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
                await websocket.send_text(json.dumps({
                    "type": "players_update",
                    "players": room_manager.get_players_list(room_code)
                }))

    except WebSocketDisconnect:
        connections[room_code].discard(websocket)
        room_manager.leave_room(socket_id)
        await broadcast_to_room(room_code, {
            "type": "players_update",
            "players": room_manager.get_players_list(room_code)
        })


async def broadcast_to_room(room_code: str, message: dict, exclude_socket: WebSocket = None):
    if room_code in connections:
        for conn in connections[room_code]:
            if conn != exclude_socket:
                try:
                    await conn.send_text(json.dumps(message))
                except:
                    pass