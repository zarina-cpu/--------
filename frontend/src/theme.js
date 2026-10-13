export function applyTheme(dark) {
  if (dark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    document.documentElement.style.colorScheme = 'light';
  }
}
