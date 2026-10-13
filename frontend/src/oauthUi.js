export const OAUTH_META = {
  google: {
    label: 'Google',
    buttonClass: '',
    iconClass: 'text-accent-600 dark:text-accent-400',
    icon: 'G',
  },
  yandex: {
    label: 'Яндекс',
    buttonClass: '',
    iconClass: 'text-accent-600 dark:text-accent-400',
    icon: 'Я',
  },
  apple: {
    label: 'Apple',
    buttonClass: '',
    iconClass: 'text-warm-800 dark:text-warm-100',
    icon: '',
  },
  github: {
    label: 'GitHub',
    buttonClass: '',
    iconClass: 'text-warm-700 dark:text-warm-200',
    icon: 'GH',
  },
  vk: {
    label: 'ВКонтакте',
    buttonClass: '',
    iconClass: 'text-accent-600 dark:text-accent-400',
    icon: 'VK',
  },
};

export function getOAuthMeta(provider) {
  return (
    OAUTH_META[provider] || {
      label: provider,
      buttonClass: '',
      iconClass: '',
      icon: '•',
    }
  );
}
