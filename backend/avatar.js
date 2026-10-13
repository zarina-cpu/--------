/**
 * Аватар пользователя:
 * - Google OAuth: syncProviderAvatar — подтягивает фото из профиля, если пользователь не выбрал своё вручную.
 * - Любой вход: setManualAvatar — загрузка с устройства (data URL), помечается source = manual.
 * - clearUserAvatar — сброс; при следующем входе через Google фото снова подтянется.
 */

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_MB = 10;

function validateAvatarUrl(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') {
    return { ok: false, message: 'avatar_url required' };
  }
  if (avatarUrl.startsWith('https://') || avatarUrl.startsWith('http://')) {
    if (avatarUrl.length > 4096) {
      return { ok: false, message: 'URL too long' };
    }
    return { ok: true };
  }
  if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(avatarUrl)) {
    const b64 = avatarUrl.split(',')[1];
    if (!b64) {
      return { ok: false, message: 'Invalid image data' };
    }
    if (Buffer.byteLength(b64, 'base64') > MAX_AVATAR_BYTES) {
      return { ok: false, message: `Файл больше ${MAX_AVATAR_MB} МБ` };
    }
    return { ok: true };
  }
  return { ok: false, message: 'Invalid avatar format' };
}

function oauthAvatarSource(provider) {
  if (!provider) return 'oauth';
  return String(provider).toLowerCase();
}

async function getAvatarState(pool, userId) {
  const { rows } = await pool.query(
    'SELECT avatar_url, avatar_source FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || { avatar_url: null, avatar_source: null };
}

/**
 * Сохранить фото из OAuth (Google и др.), не затирая ручную загрузку.
 */
async function syncProviderAvatar(pool, userId, provider, avatarUrl) {
  if (!avatarUrl) {
    return getAvatarState(pool, userId);
  }
  const check = validateAvatarUrl(avatarUrl);
  if (!check.ok) {
    return getAvatarState(pool, userId);
  }

  const current = await getAvatarState(pool, userId);
  if (current.avatar_source === 'manual') {
    return current;
  }

  const source = oauthAvatarSource(provider);
  const { rows } = await pool.query(
    `UPDATE users SET avatar_url = $1, avatar_source = $2 WHERE id = $3
     RETURNING avatar_url, avatar_source`,
    [avatarUrl, source, userId]
  );
  return rows[0];
}

/**
 * Ручная загрузка с устройства (base64 data URL).
 */
async function setManualAvatar(pool, userId, avatarUrl) {
  const check = validateAvatarUrl(avatarUrl);
  if (!check.ok) {
    const err = new Error(check.message);
    err.status = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `UPDATE users SET avatar_url = $1, avatar_source = 'manual' WHERE id = $2
     RETURNING avatar_url, avatar_source`,
    [avatarUrl, userId]
  );
  return rows[0];
}

async function clearUserAvatar(pool, userId) {
  const { rows } = await pool.query(
    `UPDATE users SET avatar_url = NULL, avatar_source = NULL WHERE id = $1
     RETURNING avatar_url, avatar_source`,
    [userId]
  );
  return rows[0];
}

module.exports = {
  MAX_AVATAR_BYTES,
  validateAvatarUrl,
  syncProviderAvatar,
  setManualAvatar,
  clearUserAvatar,
  oauthAvatarSource,
};
