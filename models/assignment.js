const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database'); 

const Assignment = sequelize.define('Assignment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1,
            max: 100
        }
    },
    num_of_attemps: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1,
            max: 100
        }
    },
    deadline: {
        type: DataTypes.DATE,
        allowNull: false
    },
    assignment_created: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
    },
    assignment_updated: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
    },
    // New field added for storing creator's email or username
    created_by: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'assignments',
    timestamps: true,  // enable auto-updating of the `assignment_updated` field
    createdAt: 'assignment_created',
    updatedAt: 'assignment_updated'
});

module.exports = Assignment;
