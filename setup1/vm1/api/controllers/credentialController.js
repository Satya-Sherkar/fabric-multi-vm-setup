'use strict';

const fabricUtils = require('../services/fabricUtils');
const { v4: uuidv4 } = require('uuid');
const { uploadToPinata, uploadJSONToPinata } = require('../services/ipfsUpload');
const fs = require('fs');
const CHAINCODE = 'credential-cc';


async function issueCredential(req, res) {
    try {
        const {
            orgID,
            userID,
            holder,
            credentialData,
            certificateType,
            secondaryDocumentData
        } = req.body;

        if (
            !orgID ||
            !userID ||
            !holder ||
            !credentialData ||
            !certificateType ||
            !secondaryDocumentData
        ) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields"
            });
        }

        if (
            certificateType !== "EDUCATION" &&
            certificateType !== "GOVERNMENT"
        ) {
            return res.status(400).json({
                status: false,
                message:
                    "certificateType must be EDUCATION or GOVERNMENT"
            });
        }

        let verificationConfig = {};

        if (certificateType === "EDUCATION") {
            const requiredCredentialFields = [
                "name",
                "dob",
                "course",
                "institution"
            ];

            const requiredSecondaryFields = [
                "type",
                "name",
                "dob",
                "aadhaarLast4"
            ];

            const missingCredentialFields =
                requiredCredentialFields.filter(
                    field => !credentialData[field]
                );

            const missingSecondaryFields =
                requiredSecondaryFields.filter(
                    field => !secondaryDocumentData[field]
                );

            if (missingCredentialFields.length > 0) {
                return res.status(400).json({
                    status: false,
                    message:
                        `Missing credentialData fields: ${missingCredentialFields.join(", ")}`
                });
            }

            if (missingSecondaryFields.length > 0) {
                return res.status(400).json({
                    status: false,
                    message:
                        `Missing secondaryDocumentData fields: ${missingSecondaryFields.join(", ")}`
                });
            }

            if (
                secondaryDocumentData.type !== "AADHAAR"
            ) {
                return res.status(400).json({
                    status: false,
                    message:
                        "EDUCATION certificates require Aadhaar verification"
                });
            }

            verificationConfig = {
                level2Required: true,
                acceptedDocuments: ["AADHAAR"],
                matchFields: ["name", "dob"]
            };
        }

        if (certificateType === "GOVERNMENT") {
            const requiredCredentialFields = [
                "child_name",
                "dob",
                "father_name",
                "mother_name"
            ];

            const requiredSecondaryFields = [
                "type",
                "aadhaarHolderRelation",
                "name",
                "aadhaarLast4"
            ];

            const missingCredentialFields =
                requiredCredentialFields.filter(
                    field => !credentialData[field]
                );

            const missingSecondaryFields =
                requiredSecondaryFields.filter(
                    field => !secondaryDocumentData[field]
                );

            if (missingCredentialFields.length > 0) {
                return res.status(400).json({
                    status: false,
                    message:
                        `Missing credentialData fields: ${missingCredentialFields.join(", ")}`
                });
            }

            if (missingSecondaryFields.length > 0) {
                return res.status(400).json({
                    status: false,
                    message:
                        `Missing secondaryDocumentData fields: ${missingSecondaryFields.join(", ")}`
                });
            }

            if (
                secondaryDocumentData.type !== "AADHAAR"
            ) {
                return res.status(400).json({
                    status: false,
                    message:
                        "GOVERNMENT certificates require Aadhaar verification"
                });
            }

            if (
                secondaryDocumentData.aadhaarHolderRelation !== "FATHER" &&
                secondaryDocumentData.aadhaarHolderRelation !== "MOTHER"
            ) {
                return res.status(400).json({
                    status: false,
                    message:
                        "aadhaarHolderRelation must be FATHER or MOTHER"
                });
            }

            verificationConfig = {
                level2Required: true,
                acceptedDocuments: ["AADHAAR"],
                matchFields:
                    secondaryDocumentData.aadhaarHolderRelation === "FATHER"
                        ? ["father_name"]
                        : ["mother_name"]
            };
        }

        const vcId = uuidv4();

        const issuedAt = new Date(
            Date.now() - 5000
        ).toISOString();

        const credentialPayload = {
            vcId,
            holder,
            issuer: userID,
            organisation: orgID,
            issuedAt,
            certificateType,
            credentialData,
            verificationConfig,
            secondaryDocumentData
        };

        const uploadRes = await uploadJSONToPinata(
            credentialPayload
        );

        if (!uploadRes.status) {
            return res.status(500).json({
                status: false,
                message: "IPFS upload failed",
                error: uploadRes.data
            });
        }

        const cid = uploadRes.data.IpfsHash;

        const result = await fabricUtils.invokeTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: "IssueCredential",
            args: [
                vcId,
                cid,
                holder,
                issuedAt
            ]
        });

        return res.json({
            status: true,
            data: JSON.parse(result),
            meta: {
                vcId,
                cid,
                ipfsUrl: `https://ipfs.io/ipfs/${cid}`
            }
        });

    } catch (error) {
        console.error("Issue Credential Error:", error);

        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

async function verifyCredential(req, res) {
    try {
        const { orgID, userID, vcId } = req.body;

        if (!orgID || !userID || !vcId) {
            return res.status(400).json({
                status: false,
                message: "Missing required fields"
            });
        }

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: "VerifyCredential",
            args: [vcId]
        });

        const parsedResult = JSON.parse(result);

        const cid = parsedResult.cid;

        if (!cid) {
            return res.status(500).json({
                status: false,
                message: "CID missing from verification result"
            });
        }

        return res.json({
            status: true,
            data: parsedResult,
            meta: {
                cid,
                ipfsUrl: `https://ipfs.io/ipfs/${cid}`
            }
        });

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

async function revokeCredential(req, res) {
    try {
        const { orgID, userID, vcId } = req.body;

        if (!orgID || !userID || !vcId) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const revokedAt = new Date().toISOString();

        const result = await fabricUtils.invokeTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: 'RevokeCredential',
            args: [vcId, revokedAt]
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

async function getCredential(req, res) {
    try {
        const { orgID, userID } = req.query;
        const { vcId } = req.params;

        if (!orgID || !userID || !vcId) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: 'GetCredential',
            args: [vcId]
        });

        return res.json({
            status: true,
            data: JSON.parse(result)
        });

    } catch (error) {

                const msg = error.message || '';
                if (msg.includes('does not exist') || msg.includes('not found')) {
                    return res.status(404).json({
                        status: false,
                        message: 'Credential not found'
                    });
                }

                if (msg.includes('Access denied')) {
                    return res.status(403).json({
                        status: false,
                        message: 'Access denied'
                    });
                }

                if (
                    msg.includes('required') ||
                    msg.includes('Invalid') ||
                    msg.includes('cannot be')
                ) {
                    return res.status(400).json({
                        status: false,
                        message: msg
                    });
                }

                return res.status(500).json({
                    status: false,
                    message: msg
                });
        }
}

async function getIssuedByIssuer(req, res) {
    try {
        const { orgID, userID, issuerId } = req.query;

        if (!orgID || !userID || !issuerId) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: 'GetIssuedCredentialsByIssuer',
            args: [issuerId]
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

async function getRevokedByIssuer(req, res) {
    try {
        const { orgID, userID, issuerId } = req.query;

        if (!orgID || !userID || !issuerId) {
            return res.status(400).json({
                status: false,
                message: 'Missing required fields'
            });
        }

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: 'GetRevokedCredentialsByIssuer',
            args: [issuerId]
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

async function getIdentity(req, res) {
    try {
        const { orgID, userID } = req.query;

        const result = await fabricUtils.queryTransaction({
            orgID,
            userID,
            chaincodeName: CHAINCODE,
            func: 'GetMyIdentity',
            args: []
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

module.exports = {
    issueCredential,
    verifyCredential,
    revokeCredential,
    getCredential,
    getIssuedByIssuer,
    getRevokedByIssuer,
    getIdentity
};