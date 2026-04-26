const { uuidv7 } = require('uuidv7');
const { HttpError } = require('../lib/errors');
const { pkceChallenge, randomToken, sha256, signJwt, verifyJwt } = require('../lib/tokens');

const ACCESS_TOKEN_TTL_SECONDS = 3 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 5 * 60;
const WEB_CODE_TTL_SECONDS = 2 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function splitCsv(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function addSeconds(now, seconds) {
  return new Date(now.getTime() + (seconds * 1000));
}

function publicUser(user) {
  return {
    id: user.id,
    github_id: user.github_id,
    username: user.username,
    email: user.email,
    avatar_url: user.avatar_url,
    role: user.role,
    is_active: user.is_active,
  };
}

function readConfig(options = {}) {
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'stage3-local-dev-secret-change-me';
  const webClientId = options.githubWebClientId || process.env.GITHUB_WEB_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  const webClientSecret = options.githubWebClientSecret || process.env.GITHUB_WEB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  const cliClientId = options.githubCliClientId || process.env.GITHUB_CLI_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  const cliClientSecret = options.githubCliClientSecret || process.env.GITHUB_CLI_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  const backendPublicUrl = (options.backendPublicUrl || process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const webAppUrl = (options.webAppUrl || process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/$/, '');

  return {
    adminGithubIds: splitCsv(options.adminGithubIds || process.env.ADMIN_GITHUB_IDS),
    adminGithubUsernames: splitCsv(options.adminGithubUsernames || process.env.ADMIN_GITHUB_USERNAMES),
    backendPublicUrl,
    cliClientId,
    cliClientSecret,
    githubApiUrl: options.githubApiUrl || process.env.GITHUB_API_URL || 'https://api.github.com',
    githubAuthorizeUrl: options.githubAuthorizeUrl || process.env.GITHUB_AUTHORIZE_URL || 'https://github.com/login/oauth/authorize',
    githubTokenUrl: options.githubTokenUrl || process.env.GITHUB_TOKEN_URL || 'https://github.com/login/oauth/access_token',
    jwtSecret,
    webAppUrl,
    webClientId,
    webClientSecret,
  };
}

function createGithubProvider(config) {
  async function exchangeCode({ client, code, codeVerifier, redirectUri }) {
    const clientId = client === 'cli' ? config.cliClientId : config.webClientId;
    const clientSecret = client === 'cli' ? config.cliClientSecret : config.webClientSecret;
    if (!clientId || !clientSecret) {
      throw new HttpError(500, 'GitHub OAuth is not configured');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(config.githubTokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const tokenPayload = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenPayload.access_token) {
      throw new HttpError(401, 'GitHub OAuth exchange failed');
    }

    const userRes = await fetch(`${config.githubApiUrl}/user`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenPayload.access_token}`,
        'User-Agent': 'insighta-stage3',
      },
    });
    const githubUser = await userRes.json().catch(() => ({}));
    if (!userRes.ok || !githubUser.id || !githubUser.login) {
      throw new HttpError(401, 'GitHub user lookup failed');
    }

    let email = githubUser.email || null;
    if (!email) {
      const emailRes = await fetch(`${config.githubApiUrl}/user/emails`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${tokenPayload.access_token}`,
          'User-Agent': 'insighta-stage3',
        },
      });
      if (emailRes.ok) {
        const emails = await emailRes.json().catch(() => []);
        const primary = Array.isArray(emails)
          ? emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified)
          : null;
        email = primary ? primary.email : null;
      }
    }

    return {
      github_id: String(githubUser.id),
      username: githubUser.login,
      email,
      avatar_url: githubUser.avatar_url || null,
    };
  }

  return { exchangeCode };
}

function createAuthService({ repo, githubProvider, now = () => new Date(), ...options }) {
  const config = readConfig(options);
  const provider = githubProvider || createGithubProvider(config);

  function roleForGithubUser(profile) {
    const username = String(profile.username || '').toLowerCase();
    const githubId = String(profile.github_id || '').toLowerCase();
    if (config.adminGithubUsernames.has(username) || config.adminGithubIds.has(githubId)) {
      return 'admin';
    }
    return 'analyst';
  }

  function githubAuthorizeUrl({ client, redirectUri, state, codeChallenge }) {
    const clientId = client === 'cli' ? config.cliClientId : config.webClientId;
    if (!clientId) throw new HttpError(500, 'GitHub OAuth is not configured');
    const url = new URL(config.githubAuthorizeUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  function createAccessToken(user) {
    return signJwt(
      {
        jti: uuidv7(),
        sub: user.id,
        github_id: user.github_id,
        username: user.username,
        role: user.role,
        typ: 'access',
      },
      config.jwtSecret,
      ACCESS_TOKEN_TTL_SECONDS,
      now()
    );
  }

  async function issueTokenPair(user) {
    if (!user || !user.is_active) {
      throw new HttpError(403, 'User is inactive');
    }
    const accessToken = createAccessToken(user);
    const refreshToken = randomToken(32);
    await repo.createRefreshToken({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: addSeconds(now(), REFRESH_TOKEN_TTL_SECONDS),
    });
    return {
      access_token: accessToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_TTL_SECONDS,
      user: publicUser(user),
    };
  }

  async function authenticateAccessToken(token) {
    const payload = verifyJwt(token, config.jwtSecret, now());
    if (!payload || payload.typ !== 'access' || !payload.sub) return null;
    const user = await repo.findUserById(payload.sub);
    if (!user) return null;
    if (!user.is_active) throw new HttpError(403, 'User is inactive');
    return user;
  }

  async function resolveGithubUser({ client, code, codeVerifier, redirectUri }) {
    if (!code || !codeVerifier || !redirectUri) {
      throw new HttpError(400, 'Invalid OAuth callback');
    }
    const profile = await provider.exchangeCode({ client, code, codeVerifier, redirectUri });
    const user = await repo.upsertGithubUser(profile, roleForGithubUser(profile));
    if (!user.is_active) throw new HttpError(403, 'User is inactive');
    return user;
  }

  async function loginWithGithubCode({ client, code, codeVerifier, redirectUri }) {
    const user = await resolveGithubUser({ client, code, codeVerifier, redirectUri });
    return issueTokenPair(user);
  }

  async function refresh(refreshToken) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new HttpError(401, 'Refresh token required');
    }
    const user = await repo.consumeRefreshToken(sha256(refreshToken));
    if (!user) {
      throw new HttpError(401, 'Refresh token expired or revoked');
    }
    return issueTokenPair(user);
  }

  async function logout(refreshToken) {
    if (refreshToken) {
      await repo.revokeRefreshToken(sha256(refreshToken));
    }
  }

  function createWebState(returnTo) {
    const state = randomToken(24);
    const verifier = randomToken(48);
    const challenge = pkceChallenge(verifier);
    const payload = signJwt(
      {
        typ: 'oauth_state',
        state,
        verifier,
        return_to: returnTo || config.webAppUrl,
      },
      config.jwtSecret,
      OAUTH_STATE_TTL_SECONDS,
      now()
    );
    return { challenge, cookieValue: payload, state, verifier };
  }

  function verifyWebState(cookieValue, callbackState) {
    const payload = verifyJwt(cookieValue, config.jwtSecret, now());
    if (!payload || payload.typ !== 'oauth_state' || payload.state !== callbackState) {
      throw new HttpError(400, 'Invalid OAuth state');
    }
    return payload;
  }

  async function createWebAuthCode(user) {
    const code = randomToken(32);
    await repo.createWebAuthCode({
      userId: user.id,
      codeHash: sha256(code),
      expiresAt: addSeconds(now(), WEB_CODE_TTL_SECONDS),
    });
    return code;
  }

  async function consumeWebAuthCode(code) {
    if (!code || typeof code !== 'string') {
      throw new HttpError(400, 'Invalid web auth code');
    }
    const user = await repo.consumeWebAuthCode(sha256(code));
    if (!user) {
      throw new HttpError(401, 'Web auth code expired or already used');
    }
    return issueTokenPair(user);
  }

  return {
    authenticateAccessToken,
    config,
    createWebAuthCode,
    createWebState,
    githubAuthorizeUrl,
    issueTokenPair,
    loginWithGithubCode,
    logout,
    refresh,
    resolveGithubUser,
    verifyWebState,
  };
}

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  createAuthService,
  createGithubProvider,
  publicUser,
};
