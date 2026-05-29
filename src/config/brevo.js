// src/config/brevo.js
const SibApiV3Sdk = require('@getbrevo/brevo');
require('dotenv').config();

let apiInstance = null;

const initBrevo = () => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        console.error('❌ BREVO_API_KEY missing – emails will not be sent');
        return null;
    }
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications['api-key'].apiKey = apiKey;
    return new SibApiV3Sdk.TransactionalEmailsApi();
};

apiInstance = initBrevo();

module.exports = apiInstance;