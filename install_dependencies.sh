#!/bin/bash

# Prerequisites for building and deploying the application locally

cd /opt/csye6225/webapp

sudo chown -R csye6225:csye6225 /opt/csye6225/webapp/

# Install required packages using npm
echo "Installing required packages..."
sudo -u csye6225 npm install

# Set up a new Express project
echo "Setting up a new Express project..."
sudo -u csye6225 npm install express body-parser jest supertest --save-dev

# Setup Sequelize and sqlite3
echo "Setting up Sequelize and sqlite3..."
sudo -u csye6225 npm install sequelize sqlite3

# Install CSV parser and bcrypt for hashing passwords
echo "Installing CSV parser and bcrypt..."
sudo -u csye6225 npm install csv-parser bcrypt properties-reader

# Install jsonwebtoken package for token-based authentication
echo "Installing jsonwebtoken package..."
sudo -u csye6225 npm install jsonwebtoken

# Install AWS-SDK for CloudWatch
echo "Install AWS-SDK for CloudWatch"
sudo -u csye6225 npm install aws-sdk 

# Install StatsD for CloudWatch metrics
echo "Install StatsD for CloudWatch metrics"
sudo -u csye6225 npm install hot-shots 

# Install winston for CloudWatch logs
echo "Install winston for CloudWatch logs"
sudo -u csye6225 npm install winston winston-cloudwatch

# Connect the application to a MySQL database
echo "Connecting the application to MySQL database..."
sudo -u csye6225 npm install mysql2

echo "Installation complete."

# echo "Running the API..."
# node index.js
