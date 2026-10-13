/**
 * Клиентская логика аватара:
 * - после входа avatar_url приходит с API (Google или ручная загрузка);
 * - «Выбрать фото» читает файл и отправляет PUT /api/user/avatar.
 */

export const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_FILE_MB = 10;

const AVATAR_MAX_SIDE_PX = 512;

function estimateDataUrlBytes(dataUrl) {
  const b64 = String(dataUrl).split(',')[1] || '';
  return Math.ceil((b64.length * 3) / 4);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось обработать изображение'));
    img.src = dataUrl;
  });
}

async function compressImageForAvatar(dataUrl) {
  const img = await loadImage(dataUrl);
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error('Не удалось обработать изображение');
  }
  const scale = Math.min(1, AVATAR_MAX_SIDE_PX / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrl;
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.9;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (estimateDataUrlBytes(out) > MAX_AVATAR_FILE_BYTES && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  if (estimateDataUrlBytes(out) > MAX_AVATAR_FILE_BYTES) {
    throw new Error(`Файл больше ${MAX_AVATAR_FILE_MB} МБ`);
  }
  return out;
}

export function persistAvatarInStorage(url) {
  if (url) {
    localStorage.setItem('userAvatarUrl', url);
  } else {
    localStorage.removeItem('userAvatarUrl');
  }
}

export async function readImageFileAsDataUrl(file) {
  if (!file) {
    throw new Error('Файл не выбран');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Выберите файл изображения (JPG, PNG и т.д.)');
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new Error(`Файл больше ${MAX_AVATAR_FILE_MB} МБ`);
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

  return compressImageForAvatar(dataUrl);
}

export async function uploadUserAvatar(axios, dataUrl) {
  const { data } = await axios.put('/api/user/avatar', { avatar_url: dataUrl });
  return data.avatar_url;
}

export async function clearUserAvatar(axios) {
  const { data } = await axios.delete('/api/user/avatar');
  return data.avatar_url;
}

export function avatarSourceHint(oauthProvider, avatarSource) {
  if (avatarSource === 'manual') {
    return 'Своё фото. При входе через Google оно не заменится автоматически.';
  }
  if (oauthProvider === 'google' || avatarSource === 'google') {
    return 'Фото из Google-аккаунта. Можно заменить кнопкой «Выбрать фото» ниже.';
  }
  return 'Загрузите фото с устройства — оно сохранится в вашем профиле.';
}

export function avatarUploadErrorMessage(err) {
  const status = err.response?.status;
  const serverMsg = err.response?.data?.message;
  if (serverMsg) return serverMsg;
  if (status === 413) {
    return `Файл слишком большой (максимум ${MAX_AVATAR_FILE_MB} МБ). Попробуйте другое фото.`;
  }
  return err.message || 'Не удалось загрузить фото';
}
