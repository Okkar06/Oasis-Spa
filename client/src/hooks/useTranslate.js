import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import translationService from '@/services/translationService';

/**
 * Hook for automatic text translation based on user's preferred language
 * @returns {Object} Translation utilities
 */
export const useTranslate = () => {
  const { currentLanguage } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Translate a single text string
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language (default: 'en')
   * @returns {Promise<string>} Translated text
   */
  const translate = useCallback(async (text, sourceLanguage = 'en') => {
    if (!text || currentLanguage === 'en') {
      return text;
    }

    return await translationService.translateText(text, currentLanguage, sourceLanguage);
  }, [currentLanguage]);

  /**
   * Translate multiple texts in batch
   * @param {string[]} texts - Array of texts to translate
   * @param {string} sourceLanguage - Source language (default: 'en')
   * @returns {Promise<string[]>} Array of translated texts
   */
  const translateBatch = useCallback(async (texts, sourceLanguage = 'en') => {
    if (!texts || texts.length === 0 || currentLanguage === 'en') {
      return texts;
    }

    return await translationService.translateBatch(texts, currentLanguage, sourceLanguage);
  }, [currentLanguage]);

  /**
   * Translate an object's string values
   * @param {Object} obj - Object with string values to translate
   * @param {string[]} keys - Keys to translate (if not provided, translates all string values)
   * @param {string} sourceLanguage - Source language (default: 'en')
   * @returns {Promise<Object>} Object with translated values
   */
  const translateObject = useCallback(async (obj, keys = null, sourceLanguage = 'en') => {
    if (!obj || currentLanguage === 'en') {
      return obj;
    }

    const keysToTranslate = keys || Object.keys(obj).filter(key => typeof obj[key] === 'string');
    const textsToTranslate = keysToTranslate.map(key => obj[key]);

    const translatedTexts = await translateBatch(textsToTranslate, sourceLanguage);

    const result = { ...obj };
    keysToTranslate.forEach((key, index) => {
      result[key] = translatedTexts[index];
    });

    return result;
  }, [currentLanguage, translateBatch]);

  /**
   * Translate an array of objects
   * @param {Object[]} items - Array of objects to translate
   * @param {string[]} keys - Keys to translate in each object
   * @param {string} sourceLanguage - Source language (default: 'en')
   * @returns {Promise<Object[]>} Array of objects with translated values
   */
  const translateArray = useCallback(async (items, keys, sourceLanguage = 'en') => {
    if (!items || items.length === 0 || currentLanguage === 'en') {
      return items;
    }

    // Collect all texts to translate
    const textsToTranslate = [];
    items.forEach(item => {
      keys.forEach(key => {
        if (item[key] && typeof item[key] === 'string') {
          textsToTranslate.push(item[key]);
        }
      });
    });

    // Translate all texts in one batch
    const translatedTexts = await translateBatch(textsToTranslate, sourceLanguage);

    // Map translated texts back to items
    const results = [];
    let textIndex = 0;

    items.forEach(item => {
      const translatedItem = { ...item };
      keys.forEach(key => {
        if (item[key] && typeof item[key] === 'string') {
          translatedItem[key] = translatedTexts[textIndex];
          textIndex++;
        }
      });
      results.push(translatedItem);
    });

    return results;
  }, [currentLanguage, translateBatch]);

  /**
   * Simple inline translator function (synchronous wrapper)
   * Returns original text immediately and triggers translation in background
   * Use this for non-critical UI text that can update after initial render
   */
  const t = useCallback((text, sourceLanguage = 'en') => {
    if (!text || currentLanguage === 'en') {
      return text;
    }

    // Try to get from cache first
    const cacheKey = `${sourceLanguage}:${currentLanguage}:${text}`;
    if (translationService.cache.has(cacheKey)) {
      return translationService.cache.get(cacheKey);
    }

    // Trigger translation in background (non-blocking)
    translate(text, sourceLanguage).catch(console.error);

    // Return original text for now
    return text;
  }, [currentLanguage, translate]);

  return {
    translate,
    translateBatch,
    translateObject,
    translateArray,
    t,
    targetLanguage: currentLanguage,
    isTranslationEnabled: currentLanguage !== 'en',
    isLoading
  };
};

export default useTranslate;
