const request = require('supertest');
const app = require('../index');
const { Sequelize } = require('sequelize');
const db = new Sequelize({
  dialect: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  username: 'root',
  password: 'CGcg2023..',
  database: 'mysqls'
});

const populateUsers = require('../index');

describe('Health Check', () => {

    beforeAll(async () => {
        // Connect to database or set up any required configurations
        try {
            await db.authenticate();
            console.log('Database connected.');
        } catch (error) {
            console.error('Unable to connect to the database:', error);
        }
    });
    afterAll(async () => {
        // Close the database connection after all tests
        await db.close();
    });
    beforeEach(async () => {
        // Ensure the database is synchronized and populate users before each test
        try {
            await db.sync(); // Modify this line for other specific models to sync
            //await populateUsers(); // Populate users from CSV
        } catch (error) {
            console.error('Error synchronizing models or populating users:', error);
        }
    });
      
    it('should respond with a status of 200 for a successful health check', async () => {

        const response = await request(app)
          .get('/healthz');

        expect(response.statusCode).toBe(200);
    });
    
});


// const chai = require('chai');
// const chaiHttp = require('chai-http');
// const app = require('../index'); // Ensure this path correctly points to your application’s entry point

// chai.use(chaiHttp);
// const { expect } = chai;

// describe('API Endpoints', () => {
//     // Test Health Check Endpoint
//     describe('GET /healthz', () => {
//         it('should return a status of 200 for a successful health check', (done) => {
//             chai.request(app)
//                 .get('/healthz')
//                 .end((err, res) => {
//                     expect(err).to.be.null;
//                     expect(res).to.have.status(200);
//                     done();
//                 });
//         });
//     });
// });


