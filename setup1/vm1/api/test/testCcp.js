'use strict';

const fabricUtils = require('../services/fabricUtils');

async function testGetCCP() {
    try {
        const orgID = 'Org2'; // change as needed

        const ccp = fabricUtils.getCCP(orgID);

        console.log('CCP loaded successfully');
        console.log('Org:', orgID);
        console.log('MSP ID:', ccp.organizations[orgID].mspid);


    } catch (error) {
        console.error('Failed to load CCP:', error.message);
    }
}

testGetCCP();