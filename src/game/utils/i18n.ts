export let currentLangData: Record<string, any> = {};

export function initI18n(langData: Record<string, any>) {
  currentLangData = langData;
}

export function t(
  path: string, 
  variables?: Record<string, string | number>,
  fallback?: string
): string {
  const keys = path.split('.');
  let result = currentLangData;
  
  for (const key of keys) {
    if (result == null) break;
    result = result[key];
  }

  let finalString = typeof result === 'string' ? result : (fallback ?? path);

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      finalString = finalString.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }

  return finalString;
}
