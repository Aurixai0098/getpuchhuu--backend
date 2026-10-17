const app = require('../src/app');
const connectDB = require('../src/config/database');

let connectionPromise;

module.exports = async (req, res) => {
  try {
    if (!connectionPromise) {
      connectionPromise = connectDB().catch((err) => {
        connectionPromise = null;
        throw err;
      });
    }

    await connectionPromise;
    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Database connection unavailable'
    });
  }
};
