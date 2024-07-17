#!/bin/bash

# Set variables
BASE_IMAGE="images:ubuntu/focal/desktop"
NEW_IMAGE_ALIAS="ubuntu-matlab-image"
CONTAINER_NAME="temp-vm-v1"
wesTIMESTAMP=$(date +%Y%m%d%H%M%S)

# Check if an image with the same alias exists and rename it
if lxc image list | grep -q "$NEW_IMAGE_ALIAS"; then
  lxc image alias rename $NEW_IMAGE_ALIAS "${NEW_IMAGE_ALIAS}-${TIMESTAMP}"
  echo "Existing image with alias '$NEW_IMAGE_ALIAS' renamed."
fi

# Launch a new VM from the base image
lxc launch $BASE_IMAGE $CONTAINER_NAME --vm

# Wait for the VM to start
sleep 30

# Update and install necessary packages
# lxc exec $CONTAINER_NAME -- bash -c "DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y python3 python3-pip davfs2 cloud-init"
lxc exec $CONTAINER_NAME -- bash -c "export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y -o Dpkg::Options::='--force-confdef' -o Dpkg::Options::='--force-confold' python3 python3-pip davfs2 cloud-init"


# Enable and start cloud-init
lxc exec $CONTAINER_NAME -- systemctl enable cloud-init
lxc exec $CONTAINER_NAME -- systemctl start cloud-init
lxc exec $CONTAINER_NAME -- systemctl start lxd-agent.service

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


MATLAB_VERSION="R2022b"
MATLAB_INSTALLER_URL="https://ssd.mathworks.com/supportfiles/downloads/mpm/2024.1.1/glnxa64/mpm"
MATLAB_INSTALL_DIR="/usr/local/MATLAB/${MATLAB_VERSION}"
MATLAB_PRODUCTS="MATLAB Simulink" # Add all required MATLAB products here

# Install MATLAB (refer to the official MathWorks instructions for unattended installation)

lxc exec $CONTAINER_NAME -- bash -c "wget ${MATLAB_INSTALLER_URL} -O /var/tmp/mpm && chmod +x /var/tmp/mpm"

lxc exec $CONTAINER_NAME -- bash -c "/var/tmp/mpm install --release ${MATLAB_VERSION} --destination ${MATLAB_INSTALL_DIR} --products ${MATLAB_PRODUCTS}"

sleep 10


# Create MATLAB desktop shortcut
lxc exec $CONTAINER_NAME -- sudo -i bash -c "
echo '[Desktop Entry]
Version=1.0
Type=Application
Terminal=false
MimeType=text/x-matlab
Name=MATLAB R2022b
Exec=env MATLAB_USE_USERWORK=1 /usr/local/MATLAB/R2022b/bin/matlab -desktop
Icon=/usr/local/MATLAB/R2022b/bin/glnxa64/cef_resources/matlab_icon.png
Categories=Development;Math;Science
Comment=Scientific computing environment
StartupNotify=true' > /home/ubuntu/.local/share/applications/matlab.desktop

# Change ownership and permissions
chown ubuntu:ubuntu /home/ubuntu/.local/share/applications/matlab.desktop
chmod +x /home/ubuntu/.local/share/applications/matlab.desktop

# Create a symbolic link on the desktop
ln -sf /home/ubuntu/.local/share/applications/matlab.desktop /home/ubuntu/Desktop/matlab.desktop
chown ubuntu:ubuntu /home/ubuntu/Desktop/matlab.desktop

# Force update the desktop menu
xdg-desktop-menu install --novendor /home/ubuntu/.local/share/applications/matlab.desktop
xdg-desktop-menu forceupdate
"

# Validate the .desktop file creation
# lxc exec $CONTAINER_NAME -- bash -c "ls -l /home/ubuntu/.local/share/applications/matlab.desktop"
# lxc exec $CONTAINER_NAME -- bash -c "ls -l /home/ubuntu/Desktop/matlab.desktop"

# Add MATLAB to the favorites
lxc exec $CONTAINER_NAME -- bash -c "su - ubuntu -c 'gsettings set org.gnome.shell favorite-apps \"['\''firefox.desktop'\'', '\''org.gnome.Terminal.desktop'\'', '\''matlab.desktop'\'']\"'"

# Restart GNOME shell
# lxc exec $CONTAINER_NAME -- bash -c "su - ubuntu -c 'DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus gnome-shell --replace &'"
# Set MATLAB to start automatically
lxc exec $CONTAINER_NAME -- bash -c "mkdir -p /home/ubuntu/.config/autostart"
lxc exec $CONTAINER_NAME -- bash -c "cp /home/ubuntu/.local/share/applications/matlab.desktop /home/ubuntu/.config/autostart/"
lxc exec $CONTAINER_NAME -- bash -c "chmod 755 /home/ubuntu/.config/autostart/matlab.desktop"
lxc exec $CONTAINER_NAME -- bash -c "sudo chown ubuntu:ubuntu /home/ubuntu/.config/autostart/matlab.desktop"
lxc exec $CONTAINER_NAME -- bash -c "ls -l /home/ubuntu/.config/autostart/matlab.desktop"



lxc exec $CONTAINER_NAME -- bash -c 'cat <<EOF > /home/ubuntu/setup_nopasswd.sh
DEFAULT_USER="\${USERNAME:-ubuntu}"
if ! getent group nopasswdlogin > /dev/null; then
  sudo addgroup nopasswdlogin
fi
if ! id -u \${DEFAULT_USER} > /dev/null 2>&1; then
  sudo adduser \${DEFAULT_USER} nopasswdlogin || true
else
  sudo usermod -aG nopasswdlogin \${DEFAULT_USER}
fi
sudo passwd -d \${DEFAULT_USER} || true

echo "@reboot \${DEFAULT_USER} DISPLAY=:0 /home/\${DEFAULT_USER}/disable_autolock.sh" | sudo crontab -u \${DEFAULT_USER} -

cat << 'EOD' > "/home/\${DEFAULT_USER}/disable_autolock.sh"
#!/bin/bash
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0
EOD

sudo chmod +x /home/\${DEFAULT_USER}/disable_autolock.sh
EOF'

lxc exec $CONTAINER_NAME -- bash -c "chmod +x /home/ubuntu/setup_nopasswd.sh"
lxc exec $CONTAINER_NAME -- bash -c "sudo /home/ubuntu/setup_nopasswd.sh"

# Wait for the services to start
sleep 10

# Stop the VM
lxc stop $CONTAINER_NAME

# Wait for the VM to stop
while lxc info $CONTAINER_NAME | grep -q 'Status: Running'; do
  sleep 1
done

# Publish the VM as a new image with properties
lxc publish $CONTAINER_NAME --alias $NEW_IMAGE_ALIAS

# Set image not to expire
lxc image set-property $NEW_IMAGE_ALIAS remote_cache_expiry 0

# Clean up
lxc delete $CONTAINER_NAME

echo "New image '$NEW_IMAGE_ALIAS' created successfully."