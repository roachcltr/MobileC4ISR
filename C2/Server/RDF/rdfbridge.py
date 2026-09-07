import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Prevents browser CORS blocks when your friend's laptop sends the POST
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Keep track of connected C2 websites (DataLink.js)
active_websockets = []

# 1. THE MAIL SLOT (HTTP POST for your friend)
@app.post("/api/target")
async def catch_friend_data(data: dict):
    print(f"[Bridge] Received from Friend: {data}")
    
    # Broadcast the data to your C2 website over WebSocket
    dead_sockets = []
    for ws in active_websockets:
        try:
            await ws.send_json(data)
        except Exception:
            dead_sockets.append(ws)
            
    for dead in dead_sockets:
        active_websockets.remove(dead)
        
    return {"status": "ok", "message": "Relayed to C2"}


# 2. THE WEBSOCKET HOST (For your DataLink.js)
@app.websocket("/ws/optronic")
async def c2_websocket(ws: WebSocket):
    await ws.accept()
    print("[Bridge] DataLink.js (C2) connected!")
    active_websockets.append(ws)
    try:
        while True:
            # Keep the connection alive
            await ws.receive_text()
    except WebSocketDisconnect:
        active_websockets.remove(ws)
        print("[Bridge] DataLink.js disconnected.")

if __name__ == "__main__":
    # Host on all interfaces on port 8080
    uvicorn.run(app, host="0.0.0.0", port=8080)