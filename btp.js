// Client de l'API REST officielle BoxToPlay pour le bot.
//
// Une cle par compte remplace toute la pile navigateur: il n'y a plus de
// session a maintenir, donc plus rien a rafraichir. La cle est resolue par
// index de compte, comme cote worker (BTP_API_KEY_0 = accounts[0] du Gist).
const axios = require('axios');

const BTP_API_BASE = 'https://api.boxtoplay.com/v1';
const BTP_API_TIMEOUT_MS = 15000;

function apiKeyFor(account, index, env = process.env) {
    return String(
        account?.api_key
        || env[`BTP_API_KEY_${index}`]
        || env.BTP_API_KEY
        || ''
    ).trim();
}

/**
 * @param {(url: string, config: object) => Promise<{status: number, data: any}>} get
 */
function createBtpClient(get = axios.get) {
    async function btpApi(path, apiKey, params) {
        const response = await get(`${BTP_API_BASE}${path}`, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            params,
            timeout: BTP_API_TIMEOUT_MS,
            validateStatus: null,
        });
        const payload = response.data ?? {};
        // L'API renvoie aussi des erreurs applicatives en HTTP 200 avec success:false.
        if (response.status >= 400 || payload.success === false) {
            throw new Error(`BTP API ${path}: ${payload.error?.code ?? response.status}`);
        }
        return payload.data ?? {};
    }

    /**
     * Le Gist stocke des numeros panel (#956371), l'API ses propres ids.
     * Renvoie { id, expiresAt } du serveur demande, ou null.
     */
    async function resolveService(apiKey, panelId) {
        const data = await btpApi('/services/minecraft', apiKey, { limit: '50' });
        const wanted = String(panelId ?? '');
        const match = (data.services ?? []).find((s) => String(s.display_id) === wanted);
        return match ? { id: match.id, expiresAt: match.expires_at ?? null } : null;
    }

    async function fetchMetrics(apiKey, serviceId) {
        return btpApi(`/services/minecraft/${serviceId}/metrics`, apiKey);
    }

    return { btpApi, resolveService, fetchMetrics };
}

module.exports = { BTP_API_BASE, apiKeyFor, createBtpClient };
