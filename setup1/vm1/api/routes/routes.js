const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });


const onboarding = require('../controllers/onboardingController');
const credential = require('../controllers/credentialController');
const user = require('../controllers/userController');


// Onboarding
router.post('/onboard', onboarding.onboard);
router.post('/setup', onboarding.setUp);

// Credential actions
router.post('/issue', credential.issueCredential);
router.post('/verify', credential.verifyCredential);
router.post('/revoke', credential.revokeCredential);

// Credential queries
router.get('/credential/:vcId', credential.getCredential);
router.get('/issuer/issued', credential.getIssuedByIssuer);
router.get('/issuer/revoked', credential.getRevokedByIssuer);


// Identity
router.get('/identity', credential.getIdentity);
router.get('/users', user.getUsers);

module.exports = router;