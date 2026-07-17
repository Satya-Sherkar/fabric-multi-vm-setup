const { rollbackUser } = require('../identity_management/registerUser');
require('dotenv').config();

async function main() {
    await rollbackUser('vesit-issuer1', 'Vesitadmin', 'org2');
    console.log('Rollback done');
}

main();