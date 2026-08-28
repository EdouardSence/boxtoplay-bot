// Le bot pilote BoxToPlay par cle API: aucune session, aucun cookie, aucun
// navigateur. Ce qui doit tenir: la cle suit l'index de compte du Gist, et
// un numero panel se traduit en id API.
//
//   node --test btp.test.js
const assert = require('node:assert');
const { test } = require('node:test');

const { apiKeyFor, createBtpClient } = require('./btp');

const SERVICES = {
    status: 200,
    data: {
        success: true,
        data: {
            services: [
                { id: 'btp_dead', display_id: 956315, expires_at: '2026-08-27T04:23:50Z' },
                { id: 'btp_live', display_id: 956371, expires_at: '2026-08-28T17:03:00Z' },
            ],
        },
    },
};

const fakeGet = (responses) => {
    const calls = [];
    const get = async (url, config) => {
        calls.push({ url, params: config.params, auth: config.headers.Authorization });
        const next = responses.shift();
        if (!next) throw new Error(`appel non prevu: ${url}`);
        return next;
    };
    return { get, calls };
};

test('la cle suit l index du compte, comme cote worker', () => {
    const env = { BTP_API_KEY_0: 'k0', BTP_API_KEY_1: 'k1' };
    assert.equal(apiKeyFor({}, 0, env), 'k0');
    assert.equal(apiKeyFor({}, 1, env), 'k1');
    // Une cle posee dans le state prime sur l environnement.
    assert.equal(apiKeyFor({ api_key: 'depuis_gist' }, 0, env), 'depuis_gist');
    assert.equal(apiKeyFor({}, 3, env), '');
});

test('un numero panel se traduit en id API', async () => {
    const { get, calls } = fakeGet([SERVICES]);
    const btp = createBtpClient(get);
    const service = await btp.resolveService('k0', 956371);
    assert.deepEqual(service, { id: 'btp_live', expiresAt: '2026-08-28T17:03:00Z' });
    assert.equal(calls[0].auth, 'Bearer k0');
});

test('un serveur absent du compte ne renvoie rien, plutot que le mauvais', async () => {
    const { get } = fakeGet([SERVICES]);
    const btp = createBtpClient(get);
    assert.equal(await btp.resolveService('k0', 999999), null);
});

test('une erreur applicative en HTTP 200 reste une erreur', async () => {
    const { get } = fakeGet([
        { status: 200, data: { success: false, error: { code: 'api.auth.invalid_key' } } },
    ]);
    const btp = createBtpClient(get);
    await assert.rejects(() => btp.resolveService('k0', 1), /api\.auth\.invalid_key/);
});

test('les metriques remplacent les deux fetch dans la page', async () => {
    const { get, calls } = fakeGet([
        { status: 200, data: { success: true, data: { cpu_usage_percent: 65, memory_usage_mb: 2048 } } },
    ]);
    const btp = createBtpClient(get);
    const metrics = await btp.fetchMetrics('k0', 'btp_live');
    assert.equal(metrics.memory_usage_mb, 2048);
    assert.equal(metrics.cpu_usage_percent, 65);
    assert.match(calls[0].url, /\/services\/minecraft\/btp_live\/metrics$/);
});
