#!/bin/bash
# ops/netns-setup.sh
# 
# Sets up a network namespace for a specific profile to ensure complete isolation.
# Usage: sudo ./netns-setup.sh <profile_id> <interface>

NS_NAME="ns_$1"
IFACE=$2

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: sudo $0 <profile_id> <interface>"
    exit 1
fi

# Create namespace
ip netns add "$NS_NAME"

# Create veth pair
ip link add "veth_$1" type veth peer name "veth_peer_$1"

# Move peer to namespace
ip link set "veth_peer_$1" netns "$NS_NAME"

# Setup IP addresses (example subnet 10.200.X.0/24)
ip addr add "10.200.1.1/24" dev "veth_$1"
ip link set "veth_$1" up

ip netns exec "$NS_NAME" ip addr add "10.200.1.2/24" dev "veth_peer_$1"
ip netns exec "$NS_NAME" ip link set "veth_peer_$1" up
ip netns exec "$NS_NAME" ip link set lo up
ip netns exec "$NS_NAME" ip route add default via 10.200.1.1

# Enable NAT on host
iptables -t nat -A POSTROUTING -s 10.200.1.0/24 -o "$IFACE" -j MASQUERADE
echo 1 > /proc/sys/net/ipv4/ip_forward

echo "Namespace $NS_NAME created. Access it with: ip netns exec $NS_NAME <command>"
