#!/bin/bash

# Prerequisites for building and deploying the application locally
sudo apt-get update
sudo apt-get upgrade -y

sudo apt install nodejs npm -y

sudo apt install unzip 

# Install the CloudWatch Agent
sudo apt-get install -y amazon-cloudwatch-agent

sudo groupadd csye6225
sudo useradd -s /bin/false -g csye6225 -d /opt/csye6225 -m csye6225


