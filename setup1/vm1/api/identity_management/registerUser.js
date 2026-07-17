'use strict';

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { getCCP } = require('../services/fabricUtils');
const fabricUtils = require('../services/fabricUtils');

function getMSP(orgID) {
    return `${orgID.charAt(0).toUpperCase() + orgID.slice(1)}MSP`;
}

function getCA(ccp, orgID) {
    const caInfo = ccp.certificateAuthorities[`ca.${orgID.toLowerCase()}.example.com`];

    if (!caInfo) {
        throw new Error(`CA config not found for ${orgID}`);
    }

    return new FabricCAServices(
        caInfo.url,
        {
            trustedRoots: caInfo.tlsCACerts.pem,
            verify: false
        },
        caInfo.caName
    );
}

async function rollbackUser(userId) {
    try {
        const wallet = await Wallets.newFileSystemWallet('./wallet');
        await wallet.remove(userId);

        return {
            status: true,
            message: `Rollback cleanup completed for ${userId}`
        };
    } catch (err) {
        return {
            status: false,
            message: err.message
        };
    }
}

async function registerUser({ userId, role, adminId, orgID }) {
    try {
        const ccp = fabricUtils.getCCP(orgID);
        const ca = getCA(ccp, orgID);

        const wallet = await Wallets.newFileSystemWallet('./wallet');

        const existingUserIdentity = await wallet.get(userId);
        if (existingUserIdentity) {
            return {
                status: false,
                message: `${userId} already exists`
            };
        }

        const adminIdentity = await wallet.get(adminId);
        if (!adminIdentity) {
            throw new Error(`Admin ${adminId} not found`);
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, adminId);

        const secret = await ca.register(
            {
               
                enrollmentID: userId,
                role: 'client',
                maxEnrollments: -1,
                attrs: [
                    {
                        name: 'role',
                        value: role,
                        ecert: true
                    },
                    {
                        name: 'userId',
                        value: userId,
                        ecert: true
                    }
                ]
            },
            adminUser
        );

        const enrollment = await ca.enroll({
            enrollmentID: userId,
            enrollmentSecret: secret,
            attr_reqs: [
                {
                    name: 'role',
                    optional: false
                },
                {
                    name: 'userId',
                    optional: false
                }
            ]
        });

        const identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            mspId: getMSP(orgID),
            type: 'X.509'
        };

        await wallet.put(userId, identity);

        return {
            status: true,
            message: `${userId} registered successfully`
        };

    } catch (error) {
        return {
            status: false,
            message: error.message
        };
    }
}

async function onboardUser({ userId, role, orgID, inst, chaincodeName }) {
    const adminId = `${inst}adminUser`;

    try {
        const res = await registerUser({
            userId,
            role,
            adminId,
            orgID
        });

        if (!res.status) {
            return res;
        }

        await fabricUtils.invokeTransaction({
            orgID,
            userID: adminId,
            chaincodeName,
            func: 'RegisterUser',
            args: [userId, role]
        });

        return {
            status: true,
            fabricId: userId,
            message: `${role} ${userId} onboarded`
        };

    } catch (err) {
        await rollbackUser(userId);

        return {
            status: false,
            message: `Onboarding failed: ${err.message}`
        };
    }
}

module.exports = {
    registerUser,
    onboardUser,
    rollbackUser
};