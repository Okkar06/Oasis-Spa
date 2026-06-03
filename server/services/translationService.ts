import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';

export interface TranslationRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface BatchTranslationRequest {
  texts: string[];
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface TranslationResponse {
  translatedText: string;
  detectedSourceLanguage?: string;
}

export interface BatchTranslationItem {
  originalText: string;
  translatedText: string;
  detectedSourceLanguage?: string;
}

export interface BatchTranslationResponse {
  translations: BatchTranslationItem[];
}

/**
 * Translates a single text using custom translations (if available) or Google Translate API
 * Priority: Personal translations > Global translations > Google Translate
 */
export const translateText = async (
  request: TranslationRequest,
  userId?: bigint
): Promise<TranslationResponse> => {
  try {
    // Determine source language: use provided, otherwise detect
    let sourceLanguage = request.sourceLanguage;
    if (!sourceLanguage) {
      try {
        sourceLanguage = await detectLanguage(request.text);
      } catch (detErr) {
        console.warn('Language detection failed, falling back to en:', detErr instanceof Error ? detErr.message : String(detErr));
        sourceLanguage = 'en';
      }
    }

    // Normalize text for consistent DB lookups
    const normalizedText = (request.text || '').trim();

    // Check for personal custom translation first (if userId provided)
    if (userId) {
      try {
        const personalTranslation = await prisma.customTranslation.findUnique({
          where: {
            sourceText_targetLanguage_sourceLanguage_type_userId: {
              sourceText: normalizedText,
              targetLanguage: request.targetLanguage,
              sourceLanguage: sourceLanguage,
              type: 'personal',
              userId: userId,
            },
          },
        });

        if (personalTranslation) {
          // Log usage for personal custom translation
          if (userId) {
            await logTranslationUsage(userId, 'custom', normalizedText, request.targetLanguage, sourceLanguage);
          }
          return {
            translatedText: personalTranslation.translatedText,
            detectedSourceLanguage: sourceLanguage,
          };
        }
      } catch (dbError) {
        console.warn('Database query failed for personal translation, falling back to Google Translate:', dbError instanceof Error ? dbError.message : String(dbError));
        // Continue to global translation check
      }
    }

    // Check for global custom translation
    try {
      const globalTranslation = await prisma.customTranslation.findFirst({
        where: {
          sourceText: normalizedText,
          targetLanguage: request.targetLanguage,
          sourceLanguage: sourceLanguage,
          type: 'global',
          userId: null,
        },
      });

      if (globalTranslation) {
        console.log('Translation lookup: global match for', { sourceText: normalizedText, sourceLanguage, targetLanguage: request.targetLanguage });
        // Log usage for global custom translation
        if (userId) {
          await logTranslationUsage(userId, 'global', normalizedText, request.targetLanguage, sourceLanguage);
        }
        return {
          translatedText: globalTranslation.translatedText,
          detectedSourceLanguage: sourceLanguage,
        };
      }
    } catch (dbError) {
      console.warn('Database query failed for global translation, falling back to Google Translate:', dbError instanceof Error ? dbError.message : String(dbError));
      // Continue to Google Translate
    }

    // Fall back to Google Translate if no custom translation found
    const response = await axios.post(GOOGLE_TRANSLATE_URL, null, {
      params: {
        q: request.text,
        target: request.targetLanguage,
        source: sourceLanguage,
        key: GOOGLE_TRANSLATE_API_KEY,
      },
    });

    const translation = response.data.data.translations[0];

    // Log usage for API translation
    if (userId) {
      await logTranslationUsage(userId, 'api', normalizedText, request.targetLanguage, sourceLanguage || translation.detectedSourceLanguage);
    }

    return {
      translatedText: translation.translatedText,
      detectedSourceLanguage: translation.detectedSourceLanguage,
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error('Failed to translate text');
  }
};

/**
 * Translates multiple texts in batch using custom translations and Google Translate API
 * Priority: Personal translations > Global translations > Google Translate
 * Optimized with bulk database lookups
 */
export const translateBatch = async (
  request: BatchTranslationRequest,
  userId?: bigint
): Promise<BatchTranslationResponse> => {
  try {
    const defaultSourceLanguage = request.sourceLanguage || 'en';
    const results: BatchTranslationItem[] = [];
    const textsNeedingGoogleTranslate: { text: string; sourceLanguage: string }[] = [];
    
    // Normalize all texts
    const normalizedTexts = request.texts.map(text => (text || '').trim());
    const textToOriginalMap = new Map();
    request.texts.forEach((original, index) => {
      textToOriginalMap.set(normalizedTexts[index], original);
    });

    // BULK lookup for personal translations (if userId provided)
    let personalTranslations: any[] = [];
    if (userId) {
      try {
        personalTranslations = await prisma.customTranslation.findMany({
          where: {
            sourceText: { in: normalizedTexts },
            targetLanguage: request.targetLanguage,
            sourceLanguage: defaultSourceLanguage,
            type: 'personal',
            userId: userId,
          },
        });
      } catch (dbError) {
        console.warn('Bulk personal translation lookup failed:', dbError instanceof Error ? dbError.message : String(dbError));
      }
    }

    // BULK lookup for global translations
    let globalTranslations: any[] = [];
    try {
      globalTranslations = await prisma.customTranslation.findMany({
        where: {
          sourceText: { in: normalizedTexts },
          targetLanguage: request.targetLanguage,
          sourceLanguage: defaultSourceLanguage,
          type: 'global',
          userId: null,
        },
      });
    } catch (dbError) {
      console.warn('Bulk global translation lookup failed:', dbError instanceof Error ? dbError.message : String(dbError));
    }

    // Create lookup maps
    const personalMap = new Map(personalTranslations.map(t => [t.sourceText, t]));
    const globalMap = new Map(globalTranslations.map(t => [t.sourceText, t]));

    // Process each text
    for (let i = 0; i < normalizedTexts.length; i++) {
      const normalizedText = normalizedTexts[i];
      const originalText = request.texts[i];
      let foundTranslation = false;

      // Check personal translation first
      const personalTranslation = personalMap.get(normalizedText);
      if (personalTranslation) {
        results.push({
          originalText,
          translatedText: personalTranslation.translatedText,
          detectedSourceLanguage: defaultSourceLanguage,
        });
        foundTranslation = true;
        
        // Log custom translation usage (async, don't wait)
        if (userId) {
          logTranslationUsage(userId, 'custom', normalizedText, request.targetLanguage, defaultSourceLanguage).catch(() => {});
        }
      }

      // Check global translation if no personal translation found
      if (!foundTranslation) {
        const globalTranslation = globalMap.get(normalizedText);
        if (globalTranslation) {
          results.push({
            originalText,
            translatedText: globalTranslation.translatedText,
            detectedSourceLanguage: defaultSourceLanguage,
          });
          foundTranslation = true;
          
          // Log global translation usage (async, don't wait)
          if (userId) {
            logTranslationUsage(userId, 'global', normalizedText, request.targetLanguage, defaultSourceLanguage).catch(() => {});
          }
        }
      }

      // If no custom translation found, queue for Google Translate
      if (!foundTranslation) {
        textsNeedingGoogleTranslate.push({ text: originalText, sourceLanguage: defaultSourceLanguage });
      }
    }

    // Translate remaining texts with Google Translate in parallel
    if (textsNeedingGoogleTranslate.length > 0) {
      const translationPromises = textsNeedingGoogleTranslate.map(async (item) => {
        const response = await axios.post(GOOGLE_TRANSLATE_URL, null, {
          params: {
            q: item.text,
            target: request.targetLanguage,
            source: item.sourceLanguage || 'en',
            key: GOOGLE_TRANSLATE_API_KEY,
          },
        });

        const translation = response.data.data.translations[0];
        
        // Log API translation usage
        if (userId) {
          await logTranslationUsage(userId, 'api', item.text.substring(0, 1000), request.targetLanguage, item.sourceLanguage || translation.detectedSourceLanguage);
        }
        
        return {
          originalText: item.text,
          translatedText: translation.translatedText,
          detectedSourceLanguage: translation.detectedSourceLanguage,
        };
      });

      const googleTranslations = await Promise.all(translationPromises);
      results.push(...googleTranslations);
    }

    // Sort results to match original order
    const sortedResults = request.texts.map(originalText => 
      results.find(r => r.originalText === originalText)!
    );

    return {
      translations: sortedResults,
    };
  } catch (error) {
    console.error('Batch translation error:', error);
    throw new Error('Failed to translate texts');
  }
};

/**
 * Detects the language of a given text
 */
export const detectLanguage = async (text: string): Promise<string> => {
  try {
    const response = await axios.post(`${GOOGLE_TRANSLATE_URL}/detect`, null, {
      params: {
        q: text,
        key: GOOGLE_TRANSLATE_API_KEY,
      },
    });

    return response.data.data.detections[0][0].language;
  } catch (error) {
    console.error('Language detection error:', error);
    throw new Error('Failed to detect language');
  }
};
/**
 * Logs translation usage for analytics
 */
export const logTranslationUsage = async (
  userId: bigint,
  translationType: 'custom' | 'global' | 'api',
  originalText: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<void> => {
  // Logging to translation_usage_logs has been removed per project decision.
  // This function is intentionally a no-op to keep call sites stable.
  return;
};
/**
 * Gets supported languages
 */
export const getSupportedLanguages = async (): Promise<string[]> => {
  try {
    const response = await axios.get(`${GOOGLE_TRANSLATE_URL}/languages`, {
      params: {
        key: GOOGLE_TRANSLATE_API_KEY,
      },
    });

    return response.data.data.languages.map((lang: any) => lang.language);
  } catch (error) {
    console.error('Error getting supported languages:', error);
    throw new Error('Failed to get supported languages');
  }
};