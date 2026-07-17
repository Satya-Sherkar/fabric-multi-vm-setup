'use strict';

const { onboardUser, rollbackUser} = require('../identity_management/registerUser');
const { setupOrg } = require('../identity_management/identityManager');


async function setUp(req, res) {
    try {
        const { org, inst } = req.body;
        
        if (!org || !inst) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }
        
        const result = await setupOrg( org, inst );
        console.log(result)
        if (!result.status) {
            return res.status(500).json({
                status: false,
                message: result.message
            });
        }

        return res.json({
            status: true,
            adminId: result.adminId,
            message: result.message
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

async function onboard(req, res) {
    try {
        const { userId, role, orgID, inst } = req.body;

        if (!userId || !role || !orgID || !inst) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const result = await onboardUser({
            userId,
            role,
            orgID,
            inst,
            chaincodeName: 'credential-cc'
        });

        return res.json(result);

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

async function rollbackUserController(req, res) {
    try {
        const { userId, orgID, inst } = req.body;

        if (!userId || !orgID || !inst) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const adminId = `${inst}adminUser`;

        const result = await rollbackUser(userId, adminId, orgID);

        return res.status(200).json(result);

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

module.exports = {
    setUp,
    onboard,
    rollbackUserController
};
