#!/bin/bash

# Set variables
BASE_IMAGE="ubuntu:20.04"
NEW_IMAGE_ALIAS="ubuntu-jupyter-container-image"
CONTAINER_NAME="temp-container"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Check if an image with the same alias exists and rename it
if lxc image list | grep -q "$NEW_IMAGE_ALIAS"; then
  lxc image alias rename $NEW_IMAGE_ALIAS "${NEW_IMAGE_ALIAS}-${TIMESTAMP}"
  echo "Existing image with alias '$NEW_IMAGE_ALIAS' renamed."
fi

# Launch a new container from the base image
lxc launch $BASE_IMAGE $CONTAINER_NAME

# Wait for the container to start
sleep 10

# Preconfigure debconf for non-interactive davfs2 installation
lxc exec $CONTAINER_NAME -- bash -c "echo 'davfs2 davfs2/suid_file boolean true' | debconf-set-selections"

# Install necessary packages in the container
lxc exec $CONTAINER_NAME -- bash -c "DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y python3 python3-pip net-tools davfs2"

# Upgrade zipp to the required version
lxc exec $CONTAINER_NAME -- bash -c "pip3 install --upgrade zipp"

# Install Jupyter using pip
lxc exec $CONTAINER_NAME -- bash -c "pip3 install notebook"

# Create Jupyter configuration file
lxc exec $CONTAINER_NAME -- bash -c "sudo mkdir -p /root/.jupyter"
lxc exec $CONTAINER_NAME -- bash -c "echo '
c.NotebookApp.ip = \"0.0.0.0\"
c.NotebookApp.port = 8888
c.NotebookApp.open_browser = False
c.NotebookApp.token = \"\"
c.NotebookApp.password = \"\"
c.NotebookApp.allow_root = True
' > /root/.jupyter/jupyter_notebook_config.py"

# Create Jupyter systemd service file
lxc exec $CONTAINER_NAME -- bash -c "echo '
[Unit]
Description=Jupyter Notebook

[Service]
Type=simple
PIDFile=/run/jupyter.pid
ExecStart=/usr/local/bin/jupyter notebook --config=/root/.jupyter/jupyter_notebook_config.py --allow-root
User=root
Group=root
WorkingDirectory=/home/ubuntu
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
' > /etc/systemd/system/jupyter.service"

# Enable and start the Jupyter service
lxc exec $CONTAINER_NAME -- systemctl enable jupyter.service
lxc exec $CONTAINER_NAME -- systemctl start jupyter.service

# Wait for the Jupyter service to start
sleep 10

# Stop the container
lxc stop $CONTAINER_NAME

# Wait for the container to stop
while lxc info $CONTAINER_NAME | grep -q 'Status: Running'; do
  sleep 1
done

# Publish the container as a new image with properties
lxc publish $CONTAINER_NAME --alias $NEW_IMAGE_ALIAS

# Clean up
lxc delete $CONTAINER_NAME

echo "New image '$NEW_IMAGE_ALIAS' created successfully."