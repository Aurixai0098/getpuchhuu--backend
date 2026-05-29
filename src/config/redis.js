const redis = require('redis');

const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    legacyMode: false,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis: Max retries reached');
                return new Error('Redis: Max retries reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

redisClient.on('connect', () => {
    console.log('Redis client connected');
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

redisClient.on('ready', () => {
    console.log('Redis client ready');
});

module.exports = redisClient;