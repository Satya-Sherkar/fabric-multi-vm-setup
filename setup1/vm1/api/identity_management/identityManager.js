'use strict';

const { enrollAdmin } = require('./enrollAdmin');
const { registerUser } = require('./registerUser');
const fabricUtils = require('../services/fabricUtils');

const CHAINCODE = 'credential-cc';

function getAdminId(inst) {
    return `${inst}adminUser`;
}

async function setupOrg(org, inst) {
    const result = await enrollAdmin(org, inst, CHAINCODE);
  
    return result;
}

async function createUser({ userId, role, org, inst }) {

    const adminId = getAdminId(inst);

    // Step 1: Register in CA
    const res = await registerUser({
        userId,
        role,
        adminId,
        orgID: org
    });

    if (!res.status) {
        throw new Error(res.message);
    }

    // Step 2: Register in Ledger (chaincode)
    await fabricUtils.invokeTransaction({
        orgID: org,
        userID: adminId,
        chaincodeName: CHAINCODE,
        func: 'RegisterUser',
        args: [userId, role]
    });
}

async function setupDefaultUsers(org, inst) {

    await setupOrg(org, inst);

    await createUser({
        userId: `${inst}_adminuser`,
        role: 'admin',
        org,
        inst
    });

    await createUser({
        userId: `${inst}_issuer1`,
        role: 'issuer',
        org,
        inst
    });

    await createUser({
        userId: `${inst}_verifier1`,
        role: 'verifier',
        org,
        inst
    });
}

module.exports = {
    setupOrg,
    createUser,
    setupDefaultUsers
};