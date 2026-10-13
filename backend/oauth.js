const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2');
const AppleStrategy = require('passport-apple');
const GitHubStrategy = require('passport-github2').Strategy;
const VkontakteStrategy = require('passport-vkontakte').Strategy;
const https = require('https');
const { syncProviderAvatar, oauthAvatarSource } = require('./avatar');

function getBackendUrl() {
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

async function fetchUserRow(pool, userId) {
  const { rows } = await pool.query(
    'SELECT id, email, avatar_url, avatar_source FROM users WHERE id = $1',
    [userId]
  );
  return rows[0];
}

async function findOrCreateOAuthUser(pool, provider, providerId, email, avatarUrl) {
  const byOAuth = await pool.query(
    'SELECT id, email, avatar_url FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
    [provider, providerId]
  );
  if (byOAuth.rows.length > 0) {
    await syncProviderAvatar(pool, byOAuth.rows[0].id, provider, avatarUrl);
    return fetchUserRow(pool, byOAuth.rows[0].id);
  }

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    const byEmail = await pool.query('SELECT id, email, avatar_url FROM users WHERE email = $1', [
      normalizedEmail,
    ]);
    if (byEmail.rows.length > 0) {
      await pool.query(
        'UPDATE users SET oauth_provider = $1, oauth_id = $2 WHERE id = $3',
        [provider, providerId, byEmail.rows[0].id]
      );
      await syncProviderAvatar(pool, byEmail.rows[0].id, provider, avatarUrl);
      return fetchUserRow(pool, byEmail.rows[0].id);
    }
  }

  const fallbackEmail =
    normalizedEmail || `${provider}_${providerId}@oauth.myway.local`;
  const avatarSource = avatarUrl ? oauthAvatarSource(provider) : null;
  const inserted = await pool.query(
    `INSERT INTO users (email, password_hash, oauth_provider, oauth_id, avatar_url, avatar_source)
     VALUES ($1, NULL, $2, $3, $4, $5)
     RETURNING id, email, avatar_url, avatar_source`,
    [fallbackEmail, provider, providerId, avatarUrl || null, avatarSource]
  );
  return inserted.rows[0];
}

function redirectWithToken(res, signToken, user) {
  const token = signToken(user.id);
  const frontend = getFrontendUrl();
  const params = new URLSearchParams({
    oauth_token: token,
    email: user.email,
  });
  res.redirect(`${frontend}/?${params.toString()}`);
}

function fetchYandexProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'login.yandex.ru',
        path: '/info?format=json',
        method: 'GET',
        headers: { Authorization: `OAuth ${accessToken}` },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

class YandexStrategy extends OAuth2Strategy {
  constructor(options, verify) {
    super(
      {
        authorizationURL: 'https://oauth.yandex.ru/authorize',
        tokenURL: 'https://oauth.yandex.ru/token',
        ...options,
      },
      verify
    );
    this.name = 'yandex';
  }

  userProfile(accessToken, done) {
    fetchYandexProfile(accessToken)
      .then((profile) => done(null, profile))
      .catch(done);
  }
}

function getEnabledProviders() {
  const providers = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('google');
  }
  if (process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET) {
    providers.push('yandex');
  }
  if (
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    (process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH)
  ) {
    providers.push('apple');
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push('github');
  }
  if (process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET) {
    providers.push('vk');
  }
  return providers;
}

function setupOAuth(app, { pool, signToken }) {
  const backendUrl = getBackendUrl();
  const failureRedirect = `${getFrontendUrl()}/?oauth_error=social_login_failed`;

  app.get('/api/auth/providers', (_req, res) => {
    res.json({ providers: getEnabledProviders() });
  });

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const avatarUrl = profile.photos?.[0]?.value;
            const user = await findOrCreateOAuthUser(
              pool,
              'google',
              profile.id,
              email,
              avatarUrl
            );
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );

    app.get(
      '/api/auth/google',
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        prompt: 'select_account',
      })
    );

    app.get(
      '/api/auth/google/callback',
      passport.authenticate('google', { session: false, failureRedirect }),
      (req, res) => redirectWithToken(res, signToken, req.user)
    );
  }

  if (process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET) {
    passport.use(
      new YandexStrategy(
        {
          clientID: process.env.YANDEX_CLIENT_ID,
          clientSecret: process.env.YANDEX_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/yandex/callback`,
        },
        async (accessToken, _refreshToken, profile, done) => {
          try {
            const fullProfile = profile?.id ? profile : await fetchYandexProfile(accessToken);
            const user = await findOrCreateOAuthUser(
              pool,
              'yandex',
              String(fullProfile.id),
              fullProfile.default_email
            );
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );

    app.get(
      '/api/auth/yandex',
      passport.authenticate('yandex', { session: false })
    );
    app.get(
      '/api/auth/yandex/callback',
      passport.authenticate('yandex', { session: false, failureRedirect }),
      (req, res) => redirectWithToken(res, signToken, req.user)
    );
  }

  const applePrivateKey = process.env.APPLE_PRIVATE_KEY
    ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    (applePrivateKey || process.env.APPLE_PRIVATE_KEY_PATH)
  ) {
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID,
          teamID: process.env.APPLE_TEAM_ID,
          keyID: process.env.APPLE_KEY_ID,
          privateKeyString: applePrivateKey,
          privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH,
          callbackURL: `${backendUrl}/api/auth/apple/callback`,
          passReqToCallback: true,
        },
        async (_req, _accessToken, _refreshToken, _idToken, profile, done) => {
          try {
            const providerId = profile.id || profile.sub;
            const user = await findOrCreateOAuthUser(
              pool,
              'apple',
              String(providerId),
              profile.email
            );
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );

    app.get(
      '/api/auth/apple',
      passport.authenticate('apple', { session: false })
    );
    app.post(
      '/api/auth/apple/callback',
      passport.authenticate('apple', { session: false, failureRedirect }),
      (req, res) => redirectWithToken(res, signToken, req.user)
    );
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/github/callback`,
          scope: ['user:email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const user = await findOrCreateOAuthUser(
              pool,
              'github',
              String(profile.id),
              email
            );
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );

    app.get(
      '/api/auth/github',
      passport.authenticate('github', { session: false })
    );
    app.get(
      '/api/auth/github/callback',
      passport.authenticate('github', { session: false, failureRedirect }),
      (req, res) => redirectWithToken(res, signToken, req.user)
    );
  }

  if (process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET) {
    passport.use(
      new VkontakteStrategy(
        {
          clientID: process.env.VK_CLIENT_ID,
          clientSecret: process.env.VK_CLIENT_SECRET,
          callbackURL: `${backendUrl}/api/auth/vk/callback`,
          scope: ['email'],
          profileFields: ['email', 'first_name', 'last_name'],
          apiVersion: '5.131',
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            const user = await findOrCreateOAuthUser(
              pool,
              'vk',
              String(profile.id),
              email
            );
            done(null, user);
          } catch (err) {
            done(err);
          }
        }
      )
    );

    app.get('/api/auth/vk', passport.authenticate('vkontakte', { session: false }));
    app.get(
      '/api/auth/vk/callback',
      passport.authenticate('vkontakte', { session: false, failureRedirect }),
      (req, res) => redirectWithToken(res, signToken, req.user)
    );
  }
}

module.exports = { setupOAuth, getEnabledProviders };
