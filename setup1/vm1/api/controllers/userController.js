'use strict';

const fabricUtils = require('../services/fabricUtils');

async function getUsers(req, res) {
    try {
        const { orgID, userID, role, mspId } = req.query;

        if (!orgID || !userID || !role || !mspId) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: 'credential-cc',
            func: 'GetUsersByRoleAndOrg',
            args: [role, mspId]
        });

        return res.json({
            status: true,
            data: JSON.parse(result)
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

exports.getUsers = getUsers;