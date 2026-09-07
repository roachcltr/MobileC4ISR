#!/bin/bash

SESSION="starter"

# Kill any existing session with this name before launching
tmux kill-session -t "$SESSION" 2>/dev/null

# Pane 0: TMMR
tmux new-session -d -s "$SESSION" -n "Dashboard" "python3 $HOME/TMMR/CAT-10.py"

# Pane 1: Radar Console
tmux split-window -h -t "$SESSION:0" "cd \"$HOME/Radar Console\" && node backend.js"

# Pane 2: Website
tmux split-window -v -t "$SESSION:0.0" "python3 -m http.server 8000 --directory $HOME/C2/Website"

# Pane 3: Optronic Control
tmux split-window -v -t "$SESSION:0.1" "python3 $HOME/C2/Server/Optronic/control.py"

# Pane 4: RDF Bridge
tmux split-window -v -t "$SESSION:0.3" "python3 $HOME/C2/Server/RDF/rdfbridge.py"

# Tiled layout
tmux select-layout -t "$SESSION:0" tiled

# Attach to session
tmux attach-session -t "$SESSION"
