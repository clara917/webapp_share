const express = require('express');
const bodyParser = require('body-parser');
const basicAuth = require('basic-auth');
const { sendCustomMetric } = require('./metrics');
const logger = require('./logger');

const StatsD = require('hot-shots');
const statsd = new StatsD({
    port: 8125,
    errorHandler: error => {
        console.error('Error in StatsD', error);
    }
});

const app = express();

const fs = require('fs');
const csvParser = require('csv-parser');
const bcrypt = require('bcrypt');

const mysql = require('mysql2');

// Authentication Requirements
const jwt = require('jsonwebtoken');
const { Sequelize, Model, DataTypes } = require('sequelize');

// Read properties from the file
const propertiesReader = require('properties-reader');
const properties = propertiesReader('./application.properties');


// AWS SNS
const AWS = require('aws-sdk');
// const awsRegion = process.env.AWS_REGION || 'us-east-2';
const awsRegion = properties.get('AWS_REGION');
// Configuring AWS globally
AWS.config.update({ region: awsRegion });

const sns = new AWS.SNS();
const snsTopicArn = properties.get('SNS_TOPIC_ARN');

const DB_HOST = properties.get('DB_HOST');
const DB_USER = properties.get('DB_USER');
const DB_PASSWORD = properties.get('DB_PASSWORD');
const DB_NAME = properties.get('DB_NAME');

const connection = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'mysql'
});

// models
const sequelize = require('./config/database')
const Assignment = require('./models/assignment');
const Account = require('./models/account');
const Submission = require('./models/submission');

app.use(bodyParser.json());
app.use(express.json());


// Load CSV data and populate database
async function populateUsers() {
    const results = [];

    fs.createReadStream('opt/user.csv')
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            for (let user of results) {
                const existingUser = await Account.findOne({ where: { email: user.email } });
                if (!existingUser) {
                    const hashedPassword = await bcrypt.hash(user.password, 10);
                    await Account.create({
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        password: hashedPassword
                    });
                }
            }
        });
}

// Routes, authentication and other logic go here...

(async function () {
    try {
        // Connect to MySQL server
        await new Promise((resolve, reject) => {
            connection.connect(err => {
                if (err) {
                    logger.error('Error connecting to MySQL:', err);
                    // sendCustomMetric('MySQLConnectionError', 1);
                    reject(err);
                } else {
                    logger.info('Connected to MySQL server');
                    resolve();
                }
            });
        });

        // Create the schema (database)
        await new Promise((resolve, reject) => {
            connection.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
            connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`, (err, results) => {
                if (err) {
                    logger.error('Error creating schema:', err);
                    reject(err);
                } else {
                    logger.info(`Schema '${DB_NAME}' created successfully`);
                    resolve();
                }
            });
        });

        // Close the MySQL connection
        connection.end();
    } catch (error) {
        logger.error('Error in MySQL operations:', error);
    }

    try {
        await sequelize.authenticate();
        logger.info('Database connected with Sequelize.');
    } catch (error) {
        logger.error('Unable to connect to the database with Sequelize:', error);
    }

    try {
        await sequelize.sync();
        logger.info('All models were synchronized successfully.');
    } catch (error) {
        logger.error('Error synchronizing models:', error);
    }

    const PORT = process.env.NODE_PORT || 8080;
    app.listen(PORT, () => {
        logger.info(`Server started on port ${PORT}`);
    });

    try {
        await populateUsers(); // Load users from CSV
        logger.info('Users populated successfully.');
    } catch (error) {
        logger.error('Error populating users:', error);
    }
})();

// basic auth v1
async function basicAuthentication(req, res, next) {
    const user = basicAuth(req);

    if (!user || !user.name || !user.pass) {
        logger.warn('Basic Authentication - Missing credentials');
        // sendCustomMetric('AuthenticationMissingCredentials', 1);
        res.set('WWW-Authenticate', 'Basic realm="Authorization required"');
        return res.status(401).json({ error: "Authentication required" });
    }

    // Fetch the user from the CSV data or the database
    const fetchedUser = await Account.findOne({ where: { email: user.name } });

    if (!fetchedUser) {
        logger.warn(`Basic Authentication - User not found: ${user.name}`);
        // sendCustomMetric('AuthenticationUserNotFound', 1);
        return res.status(401).json({ error: "Invalid email or password" });
    }

    // Compare the password
    const validPassword = await bcrypt.compare(user.pass, fetchedUser.password);

    if (!validPassword) {
        logger.warn(`Basic Authentication - Invalid password for user: ${user.name}`);
        // sendCustomMetric('AuthenticationInvalidPassword', 1);
        return res.status(401).json({ error: "Invalid email or password" });
    }

    logger.info(`Basic Authentication - User authenticated: ${user.name}`);
    // sendCustomMetric('AuthenticationSuccess', 1);

    // If the user is authenticated, set the user object to req for future use in subsequent middlewares/routes
    req.user = fetchedUser;

    // If the user is authenticated, move to the next middleware
    next();
}

app.get('/', (req, res) => {
    res.send('Welcome to my web application!');
});

// Get List of All assignments
// 403 Forbidden
app.get('/v3/assignments', basicAuthentication, async (req, res) => {
    statsd.increment('assignments.endpoint.hit');
    logger.info('GET /v3/assignments endpoint called');

    if (Object.keys(req.query).length !== 0) {
        logger.warn('GET /v3/assignments - Bad Request: Parameters not allowed');
        // sendCustomMetric('AssignmentQueryParameterError', 1);
        statsd.increment('assignments.bad_request');
        return res.status(400).json({ error: "Bad Request: Parameters not allowed for this endpoint." });
    }

    try {
        const assignments = await Assignment.findAll();

        // Log the successful retrieval
        logger.info(`GET /v3/assignments - Retrieved ${assignments.length} assignments`);

        // Ensure we don't send fields which are not supposed to be exposed
        const filteredAssignments = assignments.map(assignment => ({
            id: assignment.id,
            name: assignment.name,
            points: assignment.points,
            num_of_attemps: assignment.num_of_attemps,
            deadline: assignment.deadline,
            assignment_created: assignment.assignment_created,
            assignment_updated: assignment.assignment_updated
        }));

        // sendCustomMetric('AssignmentsRetrieved', assignments.length);
        statsd.gauge('assignments.retrieved', assignments.length); // Record the number of assignments retrieved
        res.status(200).json(filteredAssignments);
    } catch (error) {
        logger.error(`GET /v3/assignments - Error: ${error.message}`);
        // sendCustomMetric('AssignmentsRetrieveError', 1);
        statsd.increment('assignments.retrieval_error');
        res.status(500).json({ error: "Internal server error." });
    }
});

// Create assignment
app.post('/v3/assignments', basicAuthentication, async (req, res) => {
    logger.info('POST /v3/assignments endpoint called');
    statsd.increment('assignments.post.hit');

    if (Object.keys(req.query).length !== 0) {
        logger.warn('POST /v3/assignments - Bad Request: Parameters not allowed');
        // sendCustomMetric('AssignmentCreateBadRequest', 1);
        statsd.increment('assignments.post.bad_request');
        return res.status(400).json({ error: "Bad Request: Parameters not allowed for this endpoint." });
    }
    try {
        const { name, points, num_of_attemps, deadline } = req.body;

        if (!name || !points || !num_of_attemps || !deadline) {
            logger.warn('POST /v3/assignments - Missing required fields');
            // sendCustomMetric('AssignmentCreateMissingFields', 1);
            statsd.increment('assignments.post.missing_fields');
            return res.status(400).json({ error: "Missing required fields." });
        }

        if (points < 1 || points > 100) {
            logger.warn('POST /v3/assignments - Points must be between 1 and 100');
            statsd.increment('assignments.post.invalid_points');
            return res.status(400).json({ error: "Points must be between 1 and 100." });
        }

        // Check if req.user or req.user.email is undefined
        if (!req.user || !req.user.email) {
            logger.warn('POST /v3/assignments - User email is missing');
            statsd.increment('assignments.post.no_user_email');
            return res.status(400).json({ error: "User email is missing. Make sure authentication is working correctly." });
        }

        const assignment = await Assignment.create({
            name,
            points,
            num_of_attemps,
            deadline,
            created_by: req.user.email
        });

        logger.info(`POST /v3/assignments - Assignment created with ID: ${assignment.id}`);
        statsd.increment('assignments.post.created');

        // Respond with created assignment
        res.status(201).json({
            id: assignment.id,
            name: assignment.name,
            points: assignment.points,
            num_of_attemps: assignment.num_of_attemps,
            deadline: assignment.deadline,
            assignment_created: assignment.assignment_created,
            assignment_updated: assignment.assignment_updated
        });

    } catch (error) {
        logger.error(`POST /v3/assignments - Error: ${error.message}`);
        if (error instanceof Sequelize.UniqueConstraintError) {
            statsd.increment('assignments.post.duplicate_name_error');
            return res.status(400).json({ error: "Assignment with the given name already exists." });
        }
        statsd.increment('assignments.post.creation_server_error');
        return res.status(500).json({ error: "Internal server error." });
    }
});


app.patch('*', (req, res) => {
    logger.warn(`PATCH request to undefined route: ${req.path}`);
    statsd.increment('undefined_patch_route_attempt');
    res.status(405).json({ error: "Method Not Allowed." });
});



// update assignment
function validateAssignmentData(req, res, next) {
    const { name, points, num_of_attemps, deadline } = req.body;

    if (name !== undefined && typeof name !== 'string') {
        logger.warn('Assignment data validation failed: Invalid name format');
        statsd.increment('assignment_validation_failure');
        return res.status(400).json({ error: 'Invalid name format' });
    }

    if (points !== undefined && (typeof points !== 'number' || points < 1 || points > 100)) {
        logger.warn('Assignment data validation failed: Points must be between 1 and 100');
        statsd.increment('assignment_validation_failure');
        return res.status(400).json({ error: 'Points must be between 1 and 100' });
    }

    if (num_of_attemps !== undefined && (typeof num_of_attemps !== 'number' || num_of_attemps < 1 || num_of_attemps > 100)) {
        logger.warn('Assignment data validation failed: Number of attempts must be between 1 and 100');
        statsd.increment('assignment_validation_failure');
        return res.status(400).json({ error: 'Number of attempts must be between 1 and 100' });
    }

    if (deadline !== undefined && !Date.parse(deadline)) {
        logger.warn('Assignment data validation failed: Invalid deadline format');
        statsd.increment('assignment_validation_failure');
        return res.status(400).json({ error: 'Invalid deadline format' });
    }

    logger.info('Assignment data validation successful');
    statsd.increment('assignment_validation_success');
    next();
}


// Get assignment details
app.get('/v3/assignments/:id', basicAuthentication, async (req, res) => {
    try {
        const id = req.params.id;
        logger.info(`Fetching assignment with ID: ${id}`);

        // Fetch the assignment by its id
        const assignment = await Assignment.findOne({ where: { id } });

        // If no assignment found, return 404 Not Found
        if (!assignment) {
            logger.warn(`Assignment with ID: ${id} not found`);
            // sendCustomMetric('AssignmentNotFound', 1);
            statsd.increment('assignment_not_found');
            return res.status(404).json({ error: "Assignment not found." });
        }

        // Check if the logged-in user is the owner of the assignment
        if (assignment.created_by !== req.user.email) {
            logger.warn(`User ${req.user.email} does not have permission to view assignment with ID: ${id}`);
            statsd.increment('assignment_access_denied');
            return res.status(403).json({ error: "You do not have permission to view this assignment." });
        }

        logger.info(`Assignment with ID: ${id} retrieved successfully`);
        statsd.increment('assignment_retrieved');

        // Return the assignment details
        res.status(200).json({
            id: assignment.id,
            name: assignment.name,
            points: assignment.points,
            num_of_attemps: assignment.num_of_attemps,
            deadline: assignment.deadline,
            assignment_created: assignment.assignment_created,
            assignment_updated: assignment.assignment_updated
        });

    } catch (error) {
        logger.error(`Error fetching assignment with ID: ${req.params.id}: ${error.message}`);
        // sendCustomMetric('AssignmentRetrievalError', 1);
        statsd.increment('assignment_retrieval_error');
        res.status(500).json({ error: "Internal server error." });
    }
});

// delete the assignment
app.delete('/v3/assignments/:id', basicAuthentication, async (req, res) => {
    try {
        const id = req.params.id;
        logger.info(`Attempting to delete assignment with ID: ${id}`);

        // Check if the assignment exists
        const assignment = await Assignment.findOne({ where: { id } });

        // If no assignment found, return 404 Not Found
        if (!assignment) {
            logger.warn(`Assignment with ID: ${id} not found for deletion`);
            statsd.increment('assignment_delete_not_found');
            return res.status(404).json({ error: "Assignment not found." });
        }

        if (assignment.created_by !== req.user.email) {
            logger.warn(`Forbidden: User ${req.user.email} doesn't have permission to delete assignment with ID: ${id}`);
            statsd.increment('assignment_delete_forbidden');
            return res.status(403).json({ error: "Forbidden: You don't have permission to delete this assignment." });
        }

        // If the assignment exists, delete it
        await Assignment.destroy({ where: { id } });
        logger.info(`Assignment with ID: ${id} deleted successfully`);
        statsd.increment('assignment_deleted');

        // Return 204 No Content after successful deletion
        res.status(204).end();

    } catch (error) {
        logger.error(`Error deleting assignment with ID: ${id}: ${error.message}`);
        statsd.increment('assignment_delete_error');
        res.status(500).json({ error: "Internal server error." });
    }
});


app.put('/v3/assignments/:id', basicAuthentication, validateAssignmentData, async (req, res) => {
    try {
        const id = req.params.id;
        logger.info(`Attempting to update assignment with ID: ${id}`);

        const { points } = req.body;

        // Check if the assignment exists
        const assignment = await Assignment.findOne({ where: { id } });

        // If no assignment found, return 404 Not Found
        if (!assignment) {
            logger.warn(`Assignment with ID: ${id} not found for update`);
            statsd.increment('assignment_update_not_found');
            return res.status(404).json({ error: "Assignment not found." });
        }

        if (assignment.created_by !== req.user.email) {
            logger.warn(`Forbidden: User ${req.user.email} doesn't have permission to update assignment with ID: ${id}`);
            statsd.increment('assignment_update_forbidden');
            return res.status(403).json({ error: "Forbidden: You don't have permission to update this assignment." });
        }

        // Validate points value
        if (points && (points < 1 || points > 100)) {
            logger.warn(`Invalid points value for assignment ID: ${id}`);
            statsd.increment('assignment_update_invalid_points');
            return res.status(400).json({ error: "Points must be between 1 and 100." });
        }

        // Update the assignment
        await Assignment.update(req.body, { where: { id } });
        logger.info(`Assignment with ID: ${id} updated successfully`);
        statsd.increment('assignment_updated');

        // Return 204 No Content after successful update
        res.status(204).end();

    } catch (error) {
        logger.error(`Error updating assignment with ID: ${id}: ${error.message}`);
        statsd.increment('assignment_update_error');
        res.status(500).json({ error: "Internal server error." });
    }
});


async function publishToSNSTopic(submissionDetails) {
    const message = JSON.stringify({
        userEmail: submissionDetails.userEmail, // 'to' in the Lambda
        submissionUrl: submissionDetails.submissionUrl,
        submissionCount: submissionDetails.submissionCount,
        assignmentId: submissionDetails.assignmentId
    });

    const params = {
        Message: message,
        TopicArn: snsTopicArn,
    };

    try {
        const result = await sns.publish(params).promise();
        logger.info(`Message sent to SNS topic: ${result.MessageId}`);
    } catch (error) {
        logger.error(`Error publishing to SNS topic: ${error}`);
        throw error;
    }
}


// POST endpoint to submit assignments
app.post('/v3/assignments/:id/submission', basicAuthentication, async (req, res) => {
    const assignmentId = req.params.id;
    logger.info(`POST /v3/assignments/${assignmentId}/submission endpoint called`);
    statsd.increment('assignment_submission.post.hit');

    try {
        const { submission_url } = req.body;

        // Check if submission URL is provided
        if (!submission_url || submission_url.trim() === '') {
            logger.warn('POST /v3/assignments/:id/submission - Missing submission URL');
            statsd.increment('assignment_submission.post.missing_url');
            return res.status(400).json({ error: "Submission URL is required." });
        }

        // Check if the assignment exists
        const assignment = await Assignment.findOne({ where: { id: assignmentId } });

        // If no assignment found, return 404 Not Found
        if (!assignment) {
            logger.warn(`POST /v3/assignments/${assignmentId}/submission - Assignment not found`);
            statsd.increment('assignment_submission.post.not_found');
            return res.status(404).json({ error: "Assignment not found." });
        }

        // if (assignment.created_by !== req.user.email) {
        //     logger.warn(`Forbidden: User ${req.user.email} doesn't have permission to submit assignment with ID: ${id}`);
        //     statsd.increment('assignment_submit_forbidden');
        //     return res.status(403).json({ error: "Forbidden: You don't have permission to submit this assignment." });
        // }

        // Check if the submission deadline has passed
        if (new Date(assignment.deadline) < new Date()) {
            logger.warn(`POST /v3/assignments/${assignmentId}/submission - Deadline has passed`);
            statsd.increment('assignment_submission.post.deadline_passed');
            return res.status(403).json({ error: "Submission deadline has passed." });
        }

        // Check if the user has exceeded the number of attempts
        const submissionCount = await Submission.count({ where: { assignment_id: assignmentId, submittedBy: req.user.email } });
        if (submissionCount >= assignment.num_of_attemps) {
            logger.warn(`POST /v3/assignments/${assignmentId}/submission - Exceeded submission attempts`);
            statsd.increment('assignment_submission.post.attempts_exceeded');
            return res.status(403).json({ error: "You have exceeded the number of submission attempts." });
        }

        // Save submission details
        const submission = await Submission.create({
            assignment_id: assignmentId,
            submission_url: submission_url,
            submittedBy: req.user.email
        });

        // Post submission details to SNS topic
        // Prepare the message object with necessary details
        const snsMessage = {
            submissionUrl: submission_url,
            userEmail: req.user.email,
            submissionCount: submissionCount + 1,
            assignmentId: assignmentId
        };

        // Publish the message to the SNS topic
        await publishToSNSTopic(snsMessage);

        logger.info(`POST /v3/assignments/${assignmentId}/submission - Submission recorded successfully`);
        statsd.increment('assignment_submission.post.success');

        // Respond with submission details
        res.status(201).json({
            id: submission.id,
            assignment_id: submission.assignment_id,
            submission_url: submission.submission_url,
            submission_date: submission.submission_date ? submission.submission_date.toISOString() : null,
            submission_updated: submission.submission_updated ? submission.submission_updated.toISOString() : null
        });

    } catch (error) {
        logger.error(`POST /v3/assignments/${assignmentId}/submission - Error: ${error.message}`);
        statsd.increment('assignment_submission.post.server_error');
        res.status(500).json({ error: "Internal server error." });
    }
});


// Health Check API - Checks if the application has connectivity to the database
app.get('/healthz', async (req, res) => {
    logger.info('Health check endpoint called');

    if (Object.keys(req.query).length !== 0 || Object.keys(req.body).length !== 0) {
        logger.warn('Health check - Bad Request: Parameters not allowed');
        // sendCustomMetric('HealthCheckBadRequest', 1);
        statsd.increment('health_check_bad_request');
        return res.status(400).send('Bad Request: Parameters not allowed.');
    }

    try {
        // Attempt to authenticate with the database
        await sequelize.authenticate();

        logger.info('Health check - Database connection successful');
        // sendCustomMetric('HealthCheckSuccess', 1);
        statsd.increment('health_check_success');

        // If successful, return 200 OK
        res.status(200).send('OK');

    } catch (error) {
        logger.error(`Health check - Unable to connect to the database: ${error.message}`);
        // sendCustomMetric('HealthCheckDatabaseFailure', 1);
        statsd.increment('health_check_database_failure');

        // If connection fails, return 503 Service Unavailable
        res.status(503).send('Service Unavailable');
    }
});

app.all('*', (req, res) => {
    // Log the attempt to access a non-existent endpoint
    logger.warn(`Attempt to access a non-existent endpoint: ${req.method} ${req.path}`);
    // Sending a custom metric for an attempted request on a non-existent route
    // sendCustomMetric('NonExistentEndpointAttempt', 1);
    statsd.increment('non_existent_endpoint_attempt');
    res.status(400).json({ error: "Bad Request: This endpoint does not exist." });
});

module.exports = app; // Export for testing
