# DTN Mesh Communication System

A decentralized, delay-tolerant mesh network chat application designed for extreme offline environments.

## Prerequisites
- Python 3.10+
- Node.js 18+

## Folder Structure
- `edge_server/`: Python FastAPI backend acting as the DTN node. It includes SQLite for offline storage, and an AI sentiment analysis priority engine.
- `react_client/`: React frontend (Vite) acting as the mobile client. It uses LocalForage (IndexedDB) for ultimate offline capabilities.

## Setup & Running 

### 1. Edge Servers (Laptops)
Run two edge servers locally to simulate two different distinct clusters.

**Terminal 1 (Laptop 1 / Node A):**
```bash
cd edge_server
pip install -r requirements.txt
set PORT=8001
set DB_NAME=node1.db
python main.py
```

**Terminal 2 (Laptop 2 / Node B):**
```bash
cd edge_server
set PORT=8002
set DB_NAME=node2.db
python main.py
```

### 2. Client Apps (Mobile Phones)
The client app is a React Web App. It operates fully offline using IndexedDB caching.

**Terminal 3 (React Client):**
```bash
cd react_client
npm install
npm run dev
```

The Vite dev server runs horizontally on your local network on `0.0.0.0:3000`.

- Connect Phone A to Laptop 1's Wi-Fi hotspot.
- Open `http://<LAPTOP_IP>:3000` on Phone A's browser.
- In the Chat UI, set Edge Node IP to the laptop's IP (or just leave `localhost` if testing on the same machine) and ensure the logic connects to port `8001`.

### 3. DTN Sync Validation
To sync the two clusters:
1. Send an emergency message from Phone A (e.g. "🚨 Critical medical supplies needed at camp! 🚨"). The AI engine will grant it priority level 8-10.
2. The message will naturally not appear on Phone B since they are physically isolated clusters.
3. Simulate a physical connection (or a bridge node moving between clusters) by calling the Sync API on Server 2 allowing it to pull from Server 1:
```bash
curl -X POST http://localhost:8002/api/trigger_sync -H "Content-Type: application/json" -d "{\"peer_url\": \"http://localhost:8001\"}"
```
4. Watch the message instantly appear on Phone B's screen via WebSocket, automatically forced to the top of the chat due to the AI Priority!
