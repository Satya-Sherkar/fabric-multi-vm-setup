'use strict';

const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

// Load connection profile from api/config/connection-<orgID>.json
// These profiles use Docker Swarm hostnames (peer0.org1.example.com, etc.)
// and are co-located with this codebase in the config/ directory.
function getCCP(orgID) {
    const ccpPath = path.resolve(
        __dirname,
        '..',
        'config',
        `connection-${orgID.toLowerCase()}.json`
    );

    if (!fs.existsSync(ccpPath)) {
        throw new Error(`Connection profile not found at ${ccpPath}`);
    }

    return JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
}

// Get wallet
async function getWallet() {
    const walletPath = path.join(process.cwd(), './wallet');
    return await Wallets.newFileSystemWallet(walletPath);
}

// Get contract (core function)
async function getContract({ orgID, userID, chaincodeName, contractName }) {

    const ccp = getCCP(orgID);
    const wallet = await getWallet();

    const identity = await wallet.get(userID);
    if (!identity) {
        throw new Error(`Identity for ${userID} not found in wallet`);
    }

    const gateway = new Gateway();

    // asLocalhost: false — peers are resolved via Docker Swarm overlay DNS,
    // not via localhost port mappings. This is required for multi-VM setups.
    await gateway.connect(ccp, {
        wallet,
        identity: userID,
        discovery: { enabled: true, asLocalhost: false }
    });

    const channelName = process.env.CHANNEL_NAME || 'mychannel';
    const network = await gateway.getNetwork(channelName);

    const contract = contractName
        ? network.getContract(chaincodeName, contractName)
        : network.getContract(chaincodeName);

    return { contract, gateway };
}


// Invoke transaction
async function invokeTransaction({
    orgID,
    userID,
    chaincodeName,
    contractName,
    func,
    args = []
}) {

    const { contract, gateway } = await getContract({
        orgID,
        userID,
        chaincodeName,
        contractName
    });

    try {
        const result = await contract.submitTransaction(func, ...args);
        return result.toString();
    } finally {
        gateway.disconnect();
    }
}

// Query transaction
async function queryTransaction({
    orgID,
    userID,
    chaincodeName,
    contractName,
    func,
    args = []
}) {

    const { contract, gateway } = await getContract({
        orgID,
        userID,
        chaincodeName,
        contractName
    });

    try {
        const result = await contract.evaluateTransaction(func, ...args);
        return result.toString();
    } finally {
        gateway.disconnect();
    }
}

module.exports = {
    getCCP,
    getWallet,
    getContract,
    invokeTransaction,
    queryTransaction
};