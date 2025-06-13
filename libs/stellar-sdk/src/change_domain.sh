#!/bin/bash

# This is required to change home domain in local environment

# Variables
TENANT_NAME="$1"
IP_ADDRESS="127.0.0.1"
HOSTS_FILE="/etc/hosts"

# Check if the tenant is already present in the file
if grep -q "$TENANT_NAME" "$HOSTS_FILE"; then
    echo "$TENANT_NAME is already present in $HOSTS_FILE"
else
    # Append the new entry to the hosts file
    echo "$IP_ADDRESS $TENANT_NAME" | sudo tee -a "$HOSTS_FILE" > /dev/null
    echo "$TENANT_NAME has been added to $HOSTS_FILE"
fi
