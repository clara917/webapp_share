// The AWS SDK automatically picks up the IAM role
const AWS = require('aws-sdk');

// Use an environment variable for the region or default to 'us-east-2' if not set
const awsRegion = process.env.AWS_REGION || 'us-east-2';

AWS.config.update({ region: awsRegion });
const cloudwatch = new AWS.CloudWatch();

function sendCustomMetric(metricName, value) {
    const params = {
        MetricData: [
            {
                MetricName: metricName,
                Dimensions: [
                    {
                        Name: 'APIName',
                        Value: 'webapp' // Replace with your actual API name
                    },
                    // Additional dimensions as necessary
                ],
                Timestamp: new Date(),
                Unit: 'Count',
                Value: value
            }
        ],
        Namespace: 'MyCustomMetrics' // Replace with your application's namespace
    };

    cloudwatch.putMetricData(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else console.log(data);
    });
}

module.exports = {
    sendCustomMetric
};