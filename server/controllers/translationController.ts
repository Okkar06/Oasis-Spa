import { Request, Response } from "express";
import {
  translateText,
  translateBatch,
  detectLanguage,
  getSupportedLanguages,
  TranslationRequest,
  BatchTranslationRequest,
} from "../services/translationService.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Global cache version - incremented when global translations are modified
let globalCacheVersion = Date.now().toString();

const updateCacheVersion = () => {
    globalCacheVersion = Date.now().toString();
    console.log('Cache version updated:', globalCacheVersion);
};

/**
 * Get the current cache version for client-side cache invalidation
 */
const getCacheVersionHandler = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
        version: globalCacheVersion,
    });
};

/**
 * Translates a single text using Google Translate API
 * Body: { text: string, targetLanguage: string, sourceLanguage?: string }
 */
const translateSingleHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, targetLanguage, sourceLanguage }: TranslationRequest = req.body;
        const userId = (req as any).session?.user_id ? BigInt((req as any).session.user_id) : undefined;

        if (!text || !targetLanguage) {
            res.status(400).json({
                error: "Text and targetLanguage are required.",
            });
            return;
        }

        const result = await translateText({ text, targetLanguage, sourceLanguage }, userId);

        res.status(200).json({
            message: "Translation successful",
            data: result,
        });
    } catch (error) {
        console.error("Error translating text:", error);
        res.status(500).json({ error: "Failed to translate text" });
    }
};

/**
 * Translates multiple texts in batch using Google Translate API
 * Body: { texts: string[], targetLanguage: string, sourceLanguage?: string }
 */
const translateBatchHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { texts, targetLanguage, sourceLanguage }: BatchTranslationRequest = req.body;
        const userId = (req as any).session?.user_id ? BigInt((req as any).session.user_id) : undefined;

        if (!texts || !Array.isArray(texts) || texts.length === 0 || !targetLanguage) {
            res.status(400).json({
                error: "Texts array and targetLanguage are required.",
            });
            return;
        }

        const result = await translateBatch({ texts, targetLanguage, sourceLanguage }, userId);

        res.status(200).json({
            message: "Batch translation successful",
            data: result,
        });
    } catch (error) {
        console.error("Error translating batch:", error);
        res.status(500).json({ error: "Failed to translate texts" });
    }
};

/**
 * Detects the language of a given text
 * Body: { text: string }
 */
const detectLanguageHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text } = req.body;

        if (!text) {
            res.status(400).json({
                error: "Text is required for language detection.",
            });
            return;
        }

        const detectedLanguage = await detectLanguage(text);

        res.status(200).json({
            message: "Language detection successful",
            data: { detectedLanguage },
        });
    } catch (error) {
        console.error("Error detecting language:", error);
        res.status(500).json({ error: "Failed to detect language" });
    }
};

/**
 * Gets the list of supported languages for translation
 */
const getSupportedLanguagesHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const languages = await getSupportedLanguages();

        res.status(200).json({
            message: "Supported languages retrieved successfully",
            data: { languages },
        });
    } catch (error) {
        console.error("Error getting supported languages:", error);
        res.status(500).json({ error: "Failed to get supported languages" });
    }
};

/**
 * Creates or updates a custom translation override
 * Body: { sourceText: string, targetLanguage: string, translatedText: string, sourceLanguage?: string }
 */
const createCustomTranslationHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sourceText, targetLanguage, translatedText, sourceLanguage = 'en' } = req.body;
        const userId = (req as any).session?.user_id;

        if (!sourceText || !targetLanguage || !translatedText) {
            res.status(400).json({
                error: "sourceText, targetLanguage, and translatedText are required.",
            });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: "User not authenticated" });
            return;
        }

        const customTranslation = await prisma.customTranslation.upsert({
            where: {
                sourceText_targetLanguage_sourceLanguage_type_userId: {
                    sourceText,
                    targetLanguage,
                    sourceLanguage,
                    type: 'personal',
                    userId: BigInt(userId),
                },
            },
            update: {
                translatedText,
                updatedAt: new Date(),
            },
            create: {
                sourceText,
                targetLanguage,
                translatedText,
                sourceLanguage,
                type: 'personal',
                userId: BigInt(userId),
                createdBy: BigInt(userId),
            },
        });

        res.status(200).json({
            message: "Custom translation saved successfully",
            data: customTranslation,
        });
    } catch (error) {
        console.error("Error saving custom translation:", error);
        res.status(500).json({ error: "Failed to save custom translation" });
    }
};

/**
 * Gets all custom translations for a specific target language (personal translations only for regular users)
 * Query: ?targetLanguage=zh&sourceLanguage=en
 */
const getCustomTranslationsHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { targetLanguage, sourceLanguage = 'en' } = req.query;
        const userId = (req as any).session?.user_id;

        console.log('getCustomTranslationsHandler called with:', { targetLanguage, sourceLanguage, userId });

        if (!targetLanguage) {
            res.status(400).json({ error: "targetLanguage is required" });
            return;
        }

        if (!userId) {
            console.log('User not authenticated, session:', req.session);
            res.status(401).json({ error: "User not authenticated" });
            return;
        }

        console.log('Querying database with userId:', userId, 'type:', typeof userId);

        const customTranslations = await prisma.customTranslation.findMany({
            where: {
                targetLanguage: targetLanguage as string,
                sourceLanguage: sourceLanguage as string,
                type: 'personal',
                userId: BigInt(userId),
            },
            orderBy: {
                sourceText: 'asc',
            },
        });

        console.log('Found translations:', customTranslations.length);

        res.status(200).json({
            message: "Custom translations retrieved successfully",
            data: { translations: customTranslations },
        });
    } catch (error) {
        console.error("Error getting custom translations:", error);
        console.error("Error details:", error instanceof Error ? error.message : error);
        console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');

        // Check if it's a database quota error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('compute time quota') || errorMessage.includes('quota')) {
            res.status(503).json({
                error: "Database temporarily unavailable due to quota limits. Please try again later or contact support."
            });
            return;
        }

        res.status(500).json({ error: "Failed to get custom translations" });
    }
};

/**
 * Deletes a custom translation (personal translations only)
 * Params: :id
 */
const deleteCustomTranslationHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = (req as any).session?.user_id;

        if (!id) {
            res.status(400).json({ error: "ID is required" });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: "User not authenticated" });
            return;
        }

        // First check if the translation belongs to the user and is personal
        const translation = await prisma.customTranslation.findUnique({
            where: { id: BigInt(id) },
        });

        if (!translation) {
            res.status(404).json({ error: "Custom translation not found" });
            return;
        }

        if (translation.type !== 'personal' || translation.userId?.toString() !== userId) {
            res.status(403).json({ error: "You can only delete your own personal translations" });
            return;
        }

        const deletedTranslation = await prisma.customTranslation.delete({
            where: {
                id: BigInt(id),
            },
        });

        res.status(200).json({
            message: "Custom translation deleted successfully",
            data: {
                id: deletedTranslation.id.toString(),
            }
        });
    } catch (error) {
        console.error("Error deleting custom translation:", error);
        console.error("Error details:", error instanceof Error ? error.message : error);
        console.error("ID received:", req.params.id);
        res.status(500).json({ error: "Failed to delete custom translation" });
    }
};

/**
 * Creates a global custom translation (superadmin only)
 * Body: { sourceText: string, targetLanguage: string, translatedText: string, sourceLanguage?: string }
 */
const createGlobalCustomTranslationHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sourceText, targetLanguage, translatedText, sourceLanguage = 'en' } = req.body;
        const userId = (req as any).session?.user_id;

        if (!sourceText || !targetLanguage || !translatedText) {
            res.status(400).json({
                error: "sourceText, targetLanguage, and translatedText are required.",
            });
            return;
        }

        if (!userId) {
            res.status(401).json({ error: "User not authenticated" });
            return;
        }

        // Prisma upsert cannot use `null` for a field in a compound unique where clause.
        // Use findFirst -> update/create flow for global translations (userId is null).
        const existing = await prisma.customTranslation.findFirst({
            where: {
                sourceText,
                targetLanguage,
                sourceLanguage,
                type: 'global',
            },
        });

        let customTranslation;
        if (existing) {
            customTranslation = await prisma.customTranslation.update({
                where: { id: existing.id },
                data: {
                    translatedText,
                    updatedAt: new Date(),
                },
                include: {
                    creator: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                },
            });
        } else {
            customTranslation = await prisma.customTranslation.create({
                data: {
                    sourceText,
                    targetLanguage,
                    translatedText,
                    sourceLanguage,
                    type: 'global',
                    userId: null,
                    createdBy: BigInt(userId),
                },
                include: {
                    creator: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                },
            });
        }

        // Update cache version to invalidate client caches
        updateCacheVersion();

        res.status(200).json({
            message: "Global custom translation saved successfully",
            data: customTranslation,
        });
    } catch (error) {
        console.error("Error saving global custom translation:", error);
        res.status(500).json({ error: "Failed to save global custom translation" });
    }
};

/**
 * Gets all global custom translations for a specific target language (superadmin only)
 * Query: ?targetLanguage=zh&sourceLanguage=en
 */
const getGlobalCustomTranslationsHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { targetLanguage, sourceLanguage = 'en' } = req.query;

        if (!targetLanguage) {
            res.status(400).json({ error: "targetLanguage is required" });
            return;
        }

        const customTranslations = await prisma.customTranslation.findMany({
            where: {
                targetLanguage: targetLanguage as string,
                sourceLanguage: sourceLanguage as string,
                type: 'global',
                // Accept global translations regardless of whether `userId` is null.
                // Some legacy or admin-created global records may have a non-null userId,
                // so we intentionally don't filter on userId here.
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                sourceText: 'asc',
            },
        });

        res.status(200).json({
            message: "Global custom translations retrieved successfully",
            data: { translations: customTranslations },
        });
    } catch (error) {
        console.error("Error getting global custom translations:", error);
        console.error("Error details:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to get global custom translations" });
    }
};

/**
 * Updates a global custom translation (superadmin only)
 * Params: :id
 * Body: { sourceText: string, translatedText: string }
 */
const updateGlobalCustomTranslationHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { sourceText, translatedText } = req.body;

        if (!id) {
            res.status(400).json({ error: "ID is required" });
            return;
        }

        if (!sourceText || !translatedText) {
            res.status(400).json({ error: "sourceText and translatedText are required" });
            return;
        }

        // First check if the translation exists and is global
        const existingTranslation = await prisma.customTranslation.findUnique({
            where: { id: BigInt(id) },
        });

        if (!existingTranslation) {
            res.status(404).json({ error: "Global custom translation not found" });
            return;
        }

        if (existingTranslation.type !== 'global') {
            res.status(403).json({ error: "This is not a global translation" });
            return;
        }

        const updatedTranslation = await prisma.customTranslation.update({
            where: { id: BigInt(id) },
            data: {
                sourceText,
                translatedText,
                updatedAt: new Date(),
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    },
                },
            },
        });

        // Update cache version to invalidate client caches
        updateCacheVersion();

        res.status(200).json({
            message: "Global custom translation updated successfully",
            data: updatedTranslation,
        });
    } catch (error) {
        console.error("Error updating global custom translation:", error);
        res.status(500).json({ error: "Failed to update global custom translation" });
    }
};

/**
 * Deletes a global custom translation (superadmin only)
 * Params: :id
 */
const deleteGlobalCustomTranslationHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (!id) {
            res.status(400).json({ error: "ID is required" });
            return;
        }

        // First check if the translation exists and is global
        const translation = await prisma.customTranslation.findUnique({
            where: { id: BigInt(id) },
        });

        if (!translation) {
            res.status(404).json({ error: "Global custom translation not found" });
            return;
        }

        if (translation.type !== 'global') {
            res.status(403).json({ error: "You can only delete global translations" });
            return;
        }

        const deletedTranslation = await prisma.customTranslation.delete({
            where: {
                id: BigInt(id),
            },
        });

        // Update cache version to invalidate client caches
        updateCacheVersion();

        res.status(200).json({
            message: "Global custom translation deleted successfully",
            data: {
                id: deletedTranslation.id.toString(),
            }
        });
    } catch (error) {
        console.error("Error deleting global custom translation:", error);
        console.error("Error details:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Failed to delete global custom translation" });
    }
};

/**
 * Get translation usage statistics (Super Admin only)
 * Query params: startDate, endDate, translationType, targetLanguage, limit
 */
const getTranslationUsageStatsHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        // New behavior: derive analytics from user preferences and custom translations
        // Active translators: users whose preferredLanguage exists and is not English ('en')
        const activeTranslatorsCount = await prisma.user.count({
            where: {
                AND: [
                    { preferredLanguage: { not: null } },
                    { preferredLanguage: { not: 'en' } },
                ],
            },
        });

        // Most popular language based on users' preferredLanguage (excluding English)
        const preferredLangStats = await prisma.user.groupBy({
            by: ['preferredLanguage'],
            where: {
                AND: [
                    { preferredLanguage: { not: null } },
                    { preferredLanguage: { not: 'en' } },
                ],
            },
            _count: {
                preferredLanguage: true,
            },
            orderBy: {
                _count: {
                    preferredLanguage: 'desc',
                },
            },
        });

        const mostPopular = preferredLangStats.length > 0 ? {
            language: preferredLangStats[0].preferredLanguage,
            count: preferredLangStats[0]._count.preferredLanguage,
        } : null;

        // Number of custom translations per target language (both global and personal)
        const customTranslationStats = await prisma.customTranslation.groupBy({
            by: ['targetLanguage'],
            where: {
                type: { in: ['global', 'personal'] },
            },
            _count: {
                targetLanguage: true,
            },
            orderBy: {
                _count: {
                    targetLanguage: 'desc',
                },
            },
        });

        res.status(200).json({
            message: "Translation usage statistics retrieved successfully",
            data: {
                statistics: {
                    activeTranslators: activeTranslatorsCount,
                    mostPopularLanguage: mostPopular,
                    customTranslationsByLanguage: customTranslationStats.map(s => ({
                        language: s.targetLanguage,
                        count: s._count.targetLanguage,
                    })),
                },
            },
        });
    } catch (error) {
        console.error("Error retrieving translation usage statistics:", error);
        res.status(500).json({ error: "Failed to retrieve translation usage statistics" });
    }
};

// User-specific translation usage endpoint removed per decision to stop using translation_usage_logs.


export default {
    translateSingleHandler,
    translateBatchHandler,
    detectLanguageHandler,
    getSupportedLanguagesHandler,
    createCustomTranslationHandler,
    getCustomTranslationsHandler,
    deleteCustomTranslationHandler,
    createGlobalCustomTranslationHandler,
    getGlobalCustomTranslationsHandler,
    updateGlobalCustomTranslationHandler,
    deleteGlobalCustomTranslationHandler,
    getTranslationUsageStatsHandler,
    getCacheVersionHandler,
};
