sudo cp /opt/csye6225/webapp/webapp.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable webapp.service
sudo systemctl status webapp.service
sudo systemctl start webapp.service