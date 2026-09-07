# Mobile C4ISR System

A unified Command, Control, Communications, Computers, Intelligence, Surveillance, and Reconnaissance (C4ISR) platform designed for real-time counter-UAS (C-UAV) operations, sensor integration, radar tracking, and optronic control.

---

## Quick Start

To start all backend microservices, hardware bridges, and the frontend web console simultaneously in a multi-pane `tmux` dashboard, execute:

```bash
chmod +x starter.sh
./starter.sh
```

---

## Service Architecture (Panes Overview)

The automated starter launches a single unified dashboard split into 5 operational panes:

| Pane | Service / Component | Executed Command | Description |
| :--- | :--- | :--- | :--- |
| **Pane 1** | **TMMR Radar Ingestion** | `python3 $HOME/TMMR/CAT-10.py` | Ingests and decodes raw ASTERIX Category 010 (CAT-10) radar transmission packets from the Tactical Multi-Mission Radar (TMMR) for track processing. |
| **Pane 2** | **Radar Console Backend** | `node backend.js` (in `Radar Console`) | Serves as the primary telemetry broker, WebSocket gateway, and middle-layer controller connecting radar feeds with console visualizers. |
| **Pane 3** | **C2 Web Frontend** | `python3 -m http.server 8000 --directory $HOME/C2/Website` | Delivers the central C2 web interface and tactical map dashboard (accessible via browser at `http://localhost:8000`). |
| **Pane 4** | **Optronic PTZ & Camera Control** | `python3 $HOME/C2/Server/Optronic/control.py` | Interfaces with the optical/thermal camera payload, handling PTZ slew-to-cue commands, tracking locks, and sensor telemetry. |
| **Pane 5** | **RDF Bridge** | `python3 $HOME/C2/Server/RDF/rdfbridge.py` | Bridges Radio Direction Finding (RDF) sensor telemetry and RF spectrum threat bearings into the common tactical operating picture. |

---

## Dashboard Navigation & Shortcuts

The session runs under `tmux` session name `starter`:

- **Navigate between panes:** Press `Ctrl + b`, release, then press an **Arrow Key** (`Up` / `Down` / `Left` / `Right`).
- **Zoom / Maximize a pane:** Press `Ctrl + b`, then press `z` (repeat to unzoom).
- **Detach session (leave running in background):** Press `Ctrl + b`, then press `d`.
- **Reattach to running session:** Run `tmux attach -t starter`.
- **Stop an individual service:** Focus on the pane and press `Ctrl + C` (the pane will terminate cleanly).
- **Kill all running services:** Run `tmux kill-session -t starter` from your terminal.

---

## Repository Structure

```text
├── C2/
│   ├── Server/
│   │   ├── Optronic/      # PTZ gimbal & optronic camera trackers
│   │   ├── RDF/           # Radio Direction Finding protocol bridge
│   │   └── Tracker/       # Threat analysis & radar packet processing
│   └── Website/           # Tactical map interface and web assets
├── Radar Console/         # Node.js backend & telemetry pipeline
├── TMMR/                  # Tactical Multi-Mission Radar ASTERIX decoder
├── Tugas.txt              # Task log & operational notes
└── starter.sh             # Unified tmux startup launcher
```
