const { Sequelize } = require('sequelize');
const propertiesReader = require('properties-reader');

// Read properties from the file
const properties = propertiesReader('././application.properties');

const DB_HOST = properties.get('DB_HOST');
const DB_USER = properties.get('DB_USER');
const DB_PASSWORD = properties.get('DB_PASSWORD');
const DB_NAME = properties.get('DB_NAME');

const sequelize = new Sequelize({
  database: DB_NAME,
  username: DB_USER,
  password: DB_PASSWORD,
  host: DB_HOST,
  dialect: 'mysql'
});

module.exports = sequelize;
