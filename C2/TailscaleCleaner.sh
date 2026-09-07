echo "RUN AS SUDO"
sudo iptables -I INPUT -p udp --dport 41641 -j DROP
sudo iptables -I OUTPUT -p udp --dport 41641 -j DROP
echo "DONE"