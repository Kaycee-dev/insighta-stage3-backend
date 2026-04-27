const express = require('express');
const { appendSetCookie, parseCookies, serializeCookie } = require('../lib/cookies');
const { error, success } = require('../lib/respond');
const { publicUser } = require('../services/auth');
const { requireAuth } = require('../middleware/auth');

const OAUTH_COOKIE = 'insighta_oauth_state';

function isLoopbackRedirect(uri) {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.pathname === '/callback'
    );
  } catch (err) {
    return false;
  }
}

function safeReturnTo(value, fallback) {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    const expected = new URL(fallback);
    if (url.origin === expected.origin) return url.origin;
  } catch (err) {
    return fallback;
  }
  return fallback;
}

function createAuthRouter({ authService }) {
  const router = express.Router();
  const secureCookies = authService.config.backendPublicUrl.startsWith('https://');

  router.get('/github', (req, res, next) => {
    try {
      const client = req.query.client === 'cli' ? 'cli' : 'web';
      if (client === 'cli') {
        const { redirect_uri: redirectUri, state, code_challenge: codeChallenge } = req.query;
        if (
          typeof redirectUri !== 'string' ||
          typeof state !== 'string' ||
          typeof codeChallenge !== 'string' ||
          !isLoopbackRedirect(redirectUri)
        ) {
          return error(res, 400, 'Invalid CLI OAuth request');
        }
        return res.redirect(authService.githubAuthorizeUrl({
          client,
          redirectUri,
          state,
          codeChallenge,
        }));
      }

      const returnTo = safeReturnTo(req.query.return_to, authService.config.webAppUrl);
      const redirectUri = `${authService.config.backendPublicUrl}/auth/github/callback`;
      const oauth = authService.createWebState(returnTo);
      appendSetCookie(res, serializeCookie(OAUTH_COOKIE, oauth.cookieValue, {
        httpOnly: true,
        maxAge: 10 * 60,
        path: '/auth/github',
        sameSite: 'Lax',
        secure: secureCookies,
      }));
      return res.redirect(authService.githubAuthorizeUrl({
        client,
        redirectUri,
        state: oauth.state,
        codeChallenge: oauth.challenge,
      }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/github/callback', async (req, res, next) => {
    try {
      const { code, state } = req.query;
      if (typeof code !== 'string' || typeof state !== 'string') {
        return error(res, 400, 'Invalid OAuth callback');
      }
      const cookies = parseCookies(req.headers.cookie);
      const oauth = authService.verifyWebState(cookies[OAUTH_COOKIE], state);
      const redirectUri = `${authService.config.backendPublicUrl}/auth/github/callback`;
      const user = await authService.resolveGithubUser({
        client: 'web',
        code,
        codeVerifier: oauth.verifier,
        redirectUri,
      });
      const webCode = await authService.createWebAuthCode(user);
      appendSetCookie(res, serializeCookie(OAUTH_COOKIE, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/auth/github',
        sameSite: 'Lax',
        secure: secureCookies,
      }));
      const target = new URL('/auth/callback', oauth.return_to || authService.config.webAppUrl);
      target.searchParams.set('code', webCode);
      return res.redirect(target.toString());
    } catch (err) {
      next(err);
    }
  });

  router.post('/github/cli', async (req, res, next) => {
    try {
      const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = req.body || {};
      if (
        typeof code !== 'string' ||
        typeof codeVerifier !== 'string' ||
        codeVerifier.length < 43 ||
        !isLoopbackRedirect(redirectUri)
      ) {
        return error(res, 400, 'Invalid CLI OAuth callback');
      }
      const tokenPair = await authService.loginWithGithubCode({
        client: 'cli',
        code,
        codeVerifier,
        redirectUri,
      });
      return success(res, 200, tokenPair);
    } catch (err) {
      next(err);
    }
  });

  router.post('/web/session', async (req, res, next) => {
    try {
      const tokenPair = await authService.consumeWebAuthCode((req.body || {}).code);
      return success(res, 200, tokenPair);
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const tokenPair = await authService.refresh((req.body || {}).refresh_token);
      return success(res, 200, {
        access_token: tokenPair.access_token,
        refresh_token: tokenPair.refresh_token,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      await authService.logout((req.body || {}).refresh_token);
      return success(res, 200, { message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/whoami', requireAuth(authService), (req, res) => {
    return success(res, 200, { data: publicUser(req.user) });
  });

  return router;
}

module.exports = { createAuthRouter };
