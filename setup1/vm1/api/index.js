require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

const routes = require('./routes/routes');
app.use('/api', routes);

// const fabricRoutes = require('../fabric-gateway/routes/fabricRoutes.js');
// const governanceRoutes = require('../fabric-gateway/routes/governanceRoutes');
// const API_KEY = process.env.API_KEY || 'super-secret-key';

// Middleware for API Key authentication
// const authMiddleware = (req, res, next) => {
//     const key = req.headers['x-api-key'];
//     if (key !== API_KEY) {
//         return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key' });
//     }
//     next();
// };

// app.use(authMiddleware);

// app.use('/api/fabric', fabricRoutes);
// app.use('/api/governance', governanceRoutes);

console.log("ENV PATH:", process.env.FABRIC_NETWORK_PATH);
app.listen(4000, () => console.log('Server running'));