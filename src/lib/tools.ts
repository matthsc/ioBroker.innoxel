/**
 * Tests whether the given variable is a real object and not an Array
 * @param it The variable to test
 */
export function isObject(it: unknown): it is Record<string, unknown> {
  // This is necessary because:
  // typeof null === 'object'
  // typeof [] === 'object'
  // [] instanceof Object === true
  return Object.prototype.toString.call(it) === "[object Object]";
}

/**
 * Tests whether the given variable is really an Array
 * @param it The variable to test
 */
export function isArray(it: unknown): it is unknown[] {
  if (Array.isArray != null) return Array.isArray(it);
  return Object.prototype.toString.call(it) === "[object Array]";
}

/**
 * Translates text using the Google Translate API
 * @param text The text to translate
 * @param targetLang The target languate
 * @param yandexApiKey The yandex API key. You can create one for free at https://translate.yandex.com/developers
 */
export async function translateText(
  text: string,
  targetLang: string,
  yandexApiKey?: string,
): Promise<string> {
  if (targetLang === "en") {
    return text;
  } else if (!text) {
    return "";
  }
  if (yandexApiKey) {
    return translateYandex(text, targetLang, yandexApiKey);
  } else {
    return translateGoogle(text, targetLang);
  }
}

/**
 * Fetches JSON from a URL with a 15-second timeout
 * @param url The URL to fetch
 */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`, {
      cause: response.status,
    });
  }
  return (await response.json()) as T;
}

/**
 * Translates text with Yandex API
 * @param text The text to translate
 * @param targetLang The target languate
 * @param apiKey The yandex API key. You can create one for free at https://translate.yandex.com/developers
 */
async function translateYandex(
  text: string,
  targetLang: string,
  apiKey: string,
): Promise<string> {
  if (targetLang === "zh-cn") {
    targetLang = "zh";
  }
  try {
    const url = `https://translate.yandex.net/api/v1.5/tr.json/translate?key=${apiKey}&text=${encodeURIComponent(
      text,
    )}&lang=en-${targetLang}`;
    const data = await fetchJson<{ text: string[] }>(url);
    if (isArray(data?.text)) {
      return data.text[0];
    }
    throw new Error("Invalid response for translate request");
  } catch (e) {
    throw new Error(`Could not translate to "${targetLang}": ${e}`);
  }
}

/**
 * Translates text with Google API
 * @param text The text to translate
 * @param targetLang The target languate
 */
async function translateGoogle(
  text: string,
  targetLang: string,
): Promise<string> {
  try {
    const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      text,
    )}&ie=UTF-8&oe=UTF-8`;
    const data = await fetchJson<string[][][]>(url);
    if (isArray(data)) {
      // we got a valid response
      return data[0][0][0];
    }
    throw new Error("Invalid response for translate request");
  } catch (e) {
    if (e instanceof Error && e.cause === 429) {
      throw new Error(
        `Could not translate to "${targetLang}": Rate-limited by Google Translate`,
      );
    } else {
      throw new Error(`Could not translate to "${targetLang}": ${e}`);
    }
  }
}
