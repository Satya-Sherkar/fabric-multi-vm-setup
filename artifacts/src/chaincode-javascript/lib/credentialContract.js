'use strict';

const { Contract } = require('fabric-contract-api');

class CredentialContract extends Contract {
    _getMSP(ctx) {
        return ctx.clientIdentity.getMSPID();
    }

    _getRole(ctx) {
        return ctx.clientIdentity.getAttributeValue('role');
    }

    _getUserId(ctx) {
        return ctx.clientIdentity.getAttributeValue('userId');
    }

    _requireRole(ctx, role) {
        const r = this._getRole(ctx);
        if (!r || r !== role) {
            throw new Error(`Access denied. Required role: ${role}`);
        }
    }

    _requireAnyRole(ctx, allowedRoles) {
        const role = this._getRole(ctx);

        if (!role) {
            throw new Error('Role attribute missing');
        }

        if (!allowedRoles.includes(role)) {
            throw new Error(
                `Access denied. Required one of: ${allowedRoles.join(', ')}`,
            );
        }
    }

    _getTxTime(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        return new Date(ts.seconds.low * 1000).toISOString();
    }

    _getUserKey(ctx, mspId, role, userId) {
        return ctx.stub.createCompositeKey('USER', [mspId, role, userId]);
    }

    async RegisterUser(ctx, userId, role) {
        this._requireRole(ctx, 'admin');

        if (!userId || !role) {
            throw new Error('userId and role required');
        }

        const mspId = this._getMSP(ctx);
        const key = this._getUserKey(ctx, mspId, role, userId);

        const exists = await ctx.stub.getState(key);
        if (exists && exists.length > 0) {
            throw new Error('User already exists');
        }

        const user = {
            docType: 'user',
            userId,
            role,
            mspId,
            status: 'ACTIVE',
            createdAt: this._getTxTime(ctx),
        };

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(user)));

        return JSON.stringify(user);
    }

    async GetUsersByRoleAndOrg(ctx, role, mspId) {
        if (!role || !mspId) {
            throw new Error('role and mspId required');
        }

        const iterator = await ctx.stub.getStateByPartialCompositeKey('USER', [
            mspId,
            role,
        ]);
        const results = [];

        while (true) {
            const res = await iterator.next();

            if (res.value) {
                const data = await ctx.stub.getState(res.value.key);
                results.push(JSON.parse(data.toString()));
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return JSON.stringify(results);
    }

    async _isValidIssuer(ctx) {
        this._requireRole(ctx, 'issuer');

        const mspId = this._getMSP(ctx);
        const userId = this._getUserId(ctx);

        const key = ctx.stub.createCompositeKey('USER', [
            mspId,
            'issuer',
            userId,
        ]);

        const data = await ctx.stub.getState(key);

        if (!data || data.length === 0) {
            throw new Error(`User ${userId} is not a registered issuer`);
        }

        const user = JSON.parse(data.toString());

        if (user.status !== 'ACTIVE') {
            throw new Error(`Issuer ${userId} is not active`);
        }

        return user;
    }

    async DeactivateIssuer(ctx, userId) {
        this._requireRole(ctx, 'admin');

        if (!userId) {
            throw new Error('userId required');
        }

        const mspId = this._getMSP(ctx);
        const key = ctx.stub.createCompositeKey('USER', [
            mspId,
            'issuer',
            userId,
        ]);

        const data = await ctx.stub.getState(key);
        if (!data || data.length === 0) {
            throw new Error(`Issuer ${userId} does not exist`);
        }

        const user = JSON.parse(data.toString());

        if (user.status === 'REVOKED') {
            throw new Error(`Issuer ${userId} already revoked`);
        }

        user.status = 'REVOKED';
        user.revokedAt = this._getTxTime(ctx);

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(user)));

        return JSON.stringify(user);
    }

    async CredentialExists(ctx, vcId) {
        const data = await ctx.stub.getState(vcId);
        return data && data.length > 0;
    }

    async GetCredential(ctx, vcId) {
        if (!vcId) {
            throw new Error('vcId required');
        }

        const data = await ctx.stub.getState(vcId);

        if (!data || data.length === 0) {
            throw new Error(`Credential ${vcId} does not exist`);
        }

        const credential = JSON.parse(data.toString());

        const callerMSP = this._getMSP(ctx);

        if (credential.issuer !== callerMSP) {
            throw new Error(
                'Access denied: cross-org credential access not allowed',
            );
        }

        return JSON.stringify(credential);
    }

    async IssueCredential(ctx, vcId, cid, holder, issuedAt) {
        this._requireRole(ctx, 'issuer');

        const issuerInfo = await this._isValidIssuer(ctx);

        if (!vcId || !cid || !holder || !issuedAt) {
            throw new Error('Missing required fields');
        }

        if (isNaN(Date.parse(issuedAt))) {
            throw new Error('Invalid issuedAt format');
        }

        const txTime = new Date(this._getTxTime(ctx));
        if (new Date(issuedAt) > txTime) {
            throw new Error('Issued date cannot be in the future');
        }

        const exists = await this.CredentialExists(ctx, vcId);
        if (exists) {
            throw new Error(`Credential ${vcId} already exists`);
        }

        const credential = {
            docType: 'credential',
            vcId,
            cid,
            issuer: issuerInfo.mspId,
            issuerId: issuerInfo.userId,
            holder,
            status: 'ACTIVE',
            issuedAt,
            revokedAt: null,
        };

        await ctx.stub.putState(vcId, Buffer.from(JSON.stringify(credential)));

        await ctx.stub.putState(
            ctx.stub.createCompositeKey('CRED_ISSUER', [
                issuerInfo.userId,
                vcId,
            ]),
            Buffer.from('\u0000'),
        );

        await ctx.stub.putState(
            ctx.stub.createCompositeKey('CRED_STATUS', [
                issuerInfo.userId,
                'ACTIVE',
                vcId,
            ]),
            Buffer.from('\u0000'),
        );

        return JSON.stringify(credential);
    }

    async RevokeCredential(ctx, vcId, revokedAt) {
        this._requireRole(ctx, 'issuer');

        const issuer = await this._isValidIssuer(ctx);

        if (!vcId || !revokedAt) {
            throw new Error('vcId and revokedAt required');
        }

        if (isNaN(Date.parse(revokedAt))) {
            throw new Error('Invalid revokedAt format');
        }

        const data = await ctx.stub.getState(vcId);
        if (!data || data.length === 0) {
            throw new Error(`Credential ${vcId} does not exist`);
        }

        const credential = JSON.parse(data.toString());

        if (credential.issuerId !== issuer.userId) {
            throw new Error(
                `Only the issuing entity can revoke this credential`,
            );
        }

        if (credential.status === 'REVOKED') {
            throw new Error(`Credential ${vcId} is already revoked`);
        }

        if (new Date(revokedAt) < new Date(credential.issuedAt)) {
            throw new Error(`Revocation date cannot be before issuance`);
        }

        credential.status = 'REVOKED';
        credential.revokedAt = revokedAt;

        await ctx.stub.putState(vcId, Buffer.from(JSON.stringify(credential)));

        await ctx.stub.deleteState(
            ctx.stub.createCompositeKey('CRED_STATUS', [
                issuer.userId,
                'ACTIVE',
                vcId,
            ]),
        );

        await ctx.stub.putState(
            ctx.stub.createCompositeKey('CRED_STATUS', [
                issuer.userId,
                'REVOKED',
                vcId,
            ]),
            Buffer.from('\u0000'),
        );

        return JSON.stringify(credential);
    }

    async GetIssuedCredentialsByIssuer(ctx, issuerId) {
        this._requireAnyRole(ctx, ['admin', 'issuer']);

        if (!issuerId) throw new Error('issuerId required');

        const iterator = await ctx.stub.getStateByPartialCompositeKey(
            'CRED_STATUS',
            [issuerId, 'ACTIVE'],
        );

        const results = [];

        while (true) {
            const res = await iterator.next();

            if (res.value && res.value.key) {
                const { attributes } = ctx.stub.splitCompositeKey(
                    res.value.key,
                );
                const vcId = attributes[2];

                const data = await ctx.stub.getState(vcId);

                if (data && data.length > 0) {
                    results.push(JSON.parse(data.toString()));
                }
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return JSON.stringify(results);
    }

    async GetRevokedCredentialsByIssuer(ctx, issuerId) {
        this._requireAnyRole(ctx, ['admin', 'issuer']);

        if (!issuerId) throw new Error('issuerId required');

        const iterator = await ctx.stub.getStateByPartialCompositeKey(
            'CRED_STATUS',
            [issuerId, 'REVOKED'],
        );
        const results = [];

        while (true) {
            const res = await iterator.next();

            if (res.value) {
                const { attributes } = ctx.stub.splitCompositeKey(
                    res.value.key,
                );
                const vcId = attributes[2];

                const data = await ctx.stub.getState(vcId);
                results.push(JSON.parse(data.toString()));
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return JSON.stringify(results);
    }

    async VerifyCredential(ctx, vcId) {
        this._requireRole(ctx, 'verifier');

        if (!vcId) throw new Error('vcId required');

        const data = await ctx.stub.getState(vcId);

        if (!data || data.length === 0) {
            return JSON.stringify({
                valid: false,
                reason: 'Credential does not exist',
            });
        }

        const credential = JSON.parse(data.toString());

        if (credential.docType !== 'credential') {
            return JSON.stringify({
                valid: false,
                reason: 'Invalid credential type',
            });
        }

        if (credential.status === 'REVOKED') {
            return JSON.stringify({
                valid: false,
                reason: 'Credential is revoked',
                revokedAt: credential.revokedAt,
            });
        }

        return JSON.stringify({
            valid: true,
            vcId: credential.vcId,
            cid: credential.cid,
            issuer: credential.issuer,
            issuerId: credential.issuerId,
            holder: credential.holder,
            issuedAt: credential.issuedAt,
        });
    }

    async GetMyIdentity(ctx) {
        return JSON.stringify({
            mspId: this._getMSP(ctx),
            role: this._getRole(ctx),
            userId: this._getUserId(ctx),
        });
    }
}

module.exports = CredentialContract;
