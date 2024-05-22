const winston = require('winston');
const CloudWatchTransport = require('winston-cloudwatch');

const awsRegion = process.env.AWS_REGION || 'us-east-2';

const logger = winston.createLogger({
  transports: [
    // Console transport
    new winston.transports.Console(),
    // File transport
    new winston.transports.File({ filename: '/var/log/csye6225.log' }),
    new CloudWatchTransport({
      logGroupName: 'csye6225',
      logStreamName: 'webapp', 
      awsRegion: awsRegion, 
      jsonMessage: true
    })
  ]
});

module.exports = logger;

