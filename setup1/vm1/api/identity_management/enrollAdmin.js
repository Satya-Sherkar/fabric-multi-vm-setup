'use strict';

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fabricUtils = require('../services/fabricUtils');


function getMSP(org) {
    return `${org.charAt(0).toUpperCase() + org.slice(1)}MSP`;
}

function getCA(ccp, org) {
    const caInfo = ccp.certificateAuthorities[`ca.${org}.example.com`];

    return new FabricCAServices(
        caInfo.url,
        {
            trustedRoots: caInfo.tlsCACerts.pem,
            verify: false
        },
        caInfo.caName
    );
}

async function enrollAdmin(org, inst, chaincodeName) {
    try {
        // Use the same getCCP() as the rest of the app — reads from api/config/connection-<org>.json
        // which uses Docker Swarm hostnames (ca.org1.example.com:7054, etc.)
        const ccp = fabricUtils.getCCP(org);

        const ca = getCA(ccp, org);

        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const adminId = `${inst}adminUser`;
        const caAdminId = `${org}CaAdmin`;

        const existing = await wallet.get(adminId);
        if (existing) {
            return {
                status: true,
                adminId,
                message: 'Admin already exists'
            };
        }

        let caAdminIdentity = await wallet.get(caAdminId);

        if (!caAdminIdentity) {
            const enrollment = await ca.enroll({
                enrollmentID: 'admin',
                enrollmentSecret: 'adminpw'
            });

            caAdminIdentity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes()
                },
                mspId: getMSP(org),
                type: 'X.509'
            };

            await wallet.put(caAdminId, caAdminIdentity);
        }

        const provider = wallet.getProviderRegistry().getProvider(
            caAdminIdentity.type
        );

        const caAdminUser = await provider.getUserContext(
            caAdminIdentity,
            caAdminId
        );

        const secret = await ca.register(
            {
                enrollmentID: adminId,
                role: 'client',
                maxEnrollments: -1,
                attrs: [
                    {
                        name: 'role',
                        value: 'admin',
                        ecert: true
                    },
                    {
                        name: 'userId',
                        value: adminId,
                        ecert: true
                    },
                    {
                        name: 'hf.Registrar.Roles',
                        value: 'client',
                        ecert: true
                    },
                    {
                        name: 'hf.Registrar.Attributes',
                        value: '*',
                        ecert: true
                    },
                    {
                        name: 'hf.Revoker',
                        value: 'true',
                        ecert: true
                    },
                    {
                        name: 'hf.AffiliationMgr',
                        value: 'true',
                        ecert: true
                    }
                ]
            },
            caAdminUser
        );

        const enrollment = await ca.enroll({
            enrollmentID: adminId,
            enrollmentSecret: secret,
            attr_reqs: [
                { name: 'role', optional: false },
                { name: 'userId', optional: false },
                { name: 'hf.Registrar.Roles', optional: false },
                { name: 'hf.Registrar.Attributes', optional: false },
                { name: 'hf.Revoker', optional: false },
                { name: 'hf.AffiliationMgr', optional: false }
            ]
        });

        const identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            mspId: getMSP(org),
            type: 'X.509'
        };

        await wallet.put(adminId, identity);

        await fabricUtils.invokeTransaction({
            orgID: org,
            userID: adminId,
            chaincodeName,
            func: 'RegisterUser',
            args: [adminId, 'admin']
        });

        return {
            status: true,
            adminId
        };

    } catch (error) {
        return {
            status: false,
            message: error.message
        };
    }
}

module.exports = { enrollAdmin };