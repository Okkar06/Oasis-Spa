import apiClient from './api';

/**
 * Translation service for automatic content translation
 * Server checks: Personal Custom Translation → Global Custom Translation → Google Translate API
 * Uses in-memory session cache (cleared when tab closes) for performance
 */

// In-memory cache (cleared when tab/browser closes, not persisted)
const sessionCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache per session

const translationService = {
  /**
   * Translate a single text string
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language code (e.g., 'zh', 'fr', 'es')
   * @param {string} sourceLanguage - Source language code (default: 'en')
   * @returns {Promise<string>} Translated text
   */
  translateText: async (text, targetLanguage, sourceLanguage = 'en') => {
    // Don't translate if target is English or same as source
    if (!text || targetLanguage === 'en' || targetLanguage === sourceLanguage) {
      return text;
    }

    // Check in-memory session cache
    const cacheKey = `${sourceLanguage}:${targetLanguage}:${text}`;
    const cached = sessionCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      return cached.text;
    }

    try {
      const response = await apiClient.post('/translations/translate', {
        text,
        targetLanguage,
        sourceLanguage
      });

      const translatedText = response.data.data.translatedText;
      
      // Cache in memory only
      sessionCache.set(cacheKey, {
        text: translatedText,
        timestamp: now
      });

      return translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      // Return original text if translation fails
      return text;
    }
  },

  /**
   * Translate multiple texts in a batch (more efficient)
   * @param {string[]} texts - Array of texts to translate
   * @param {string} targetLanguage - Target language code
   * @param {string} sourceLanguage - Source language code (default: 'en')
   * @returns {Promise<string[]>} Array of translated texts
   */
  translateBatch: async (texts, targetLanguage, sourceLanguage = 'en') => {
    // Don't translate if target is English or same as source
    if (!texts || texts.length === 0 || targetLanguage === 'en' || targetLanguage === sourceLanguage) {
      return texts;
    }

    const now = Date.now();
    const textsToTranslate = [];
    const results = new Array(texts.length);
    const indexMap = new Map();

    // Check cache for each text
    texts.forEach((text, index) => {
      const cacheKey = `${sourceLanguage}:${targetLanguage}:${text}`;
      const cached = sessionCache.get(cacheKey);
      
      if (cached && (now - cached.timestamp < CACHE_TTL)) {
        results[index] = cached.text;
      } else {
        if (!indexMap.has(text)) {
          indexMap.set(text, []);
          textsToTranslate.push(text);
        }
        indexMap.get(text).push(index);
      }
    });

    // All cached
    if (textsToTranslate.length === 0) {
      return results;
    }

    try {
      const response = await apiClient.post('/translations/translate/batch', {
        texts: textsToTranslate,
        targetLanguage,
        sourceLanguage
      });

      const translations = response.data?.data?.translations;

      if (!translations || !Array.isArray(translations)) {
        console.error('Invalid batch translation response:', response.data);
        return texts;
      }

      // Cache and map results
      translations.forEach((translation) => {
        const cacheKey = `${sourceLanguage}:${targetLanguage}:${translation.originalText}`;
        sessionCache.set(cacheKey, {
          text: translation.translatedText,
          timestamp: now
        });

        const indices = indexMap.get(translation.originalText);
        indices.forEach(index => {
          results[index] = translation.translatedText;
        });
      });

      return results;
    } catch (error) {
      console.error('Batch translation error:', error);
      return texts;
    }
  },

  /**
   * Clear the in-memory session cache
   */
  clearCache: () => {
    sessionCache.clear();
  },

  clearCacheForText: (text, targetLanguage, sourceLanguage = 'en') => {
    const cacheKey = `${sourceLanguage}:${targetLanguage}:${text}`;
    sessionCache.delete(cacheKey);
  },

  getCacheSize: () => {
    return sessionCache.size;
  }
};

export default translationService;
