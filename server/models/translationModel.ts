import { query as dbQuery } from '../config/database.js';
import { prisma } from '../lib/prisma.js';

interface Translation {
  id: number;
  english: string;
  chinese: string;
  meaning_in_english: string;
  meaning_in_chinese: string;
  created_at: string;
  updated_at: string;
}

const addTranslation = async (
  english: string,
  chinese: string,
  meaningInEnglish: string,
  meaningInChinese: string,
  createdAt?: string
): Promise<Translation | { error: string }> => {
  try {
    // Check if translation already exists
    const existing = await prisma.translation.findFirst({
      where: {
        english: {
          equals: english,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      return { error: `Translation for "${english}" already exists.` };
    }

    const timestamp = createdAt ? new Date(createdAt) : new Date();

    const result = await prisma.translation.create({
      data: {
        english,
        chinese,
        meaningInEnglish,
        meaningInChinese,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    });

    return {
      id: Number(result.id),
      english: result.english,
      chinese: result.chinese,
      meaning_in_english: result.meaningInEnglish,
      meaning_in_chinese: result.meaningInChinese,
      created_at: result.createdAt.toISOString(),
      updated_at: result.updatedAt.toISOString()
    };
  } catch (error) {
    console.error('Error adding translation:', error);
    throw new Error('Failed to add translation');
  }
};

const deleteTranslation = async (id: number): Promise<{ message?: string; error?: string }> => {
  try {
    const existing = await prisma.translation.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return { error: 'Translation not found.' };
    }

    await prisma.translation.delete({
      where: { id: BigInt(id) }
    });

    return { message: 'Translation deleted successfully.' };
  } catch (error) {
    console.error('Error deleting translation:', error);
    throw new Error('Failed to delete translation');
  }
};

const getAllTranslations = async (): Promise<Translation[]> => {
  try {
    const translations = await prisma.translation.findMany({
      orderBy: { id: 'asc' }
    });

    return translations.map(t => ({
      id: Number(t.id),
      english: t.english,
      chinese: t.chinese,
      meaning_in_english: t.meaningInEnglish,
      meaning_in_chinese: t.meaningInChinese,
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString()
    }));
  } catch (error: any) {
    console.error('Error fetching all translations:', error);

    if (error?.code === 'P2021' && error?.meta?.table === 'public.translations') {
      return [];
    }

    throw new Error('Failed to fetch all translations');
  }
};

const updateTranslation = async (
  id: number,
  newChinese?: string,
  newEnglishMeaning?: string,
  newChineseMeaning?: string,
  updatedAt?: string | Date // Accept updatedAt as optional param (string or Date)
): Promise<Translation | { error: string }> => {
  try {
    const existing = await prisma.translation.findUnique({
      where: { id: BigInt(id) }
    });

    if (!existing) {
      return { error: 'Translation not found.' };
    }

    // Use passed updatedAt or default to current time
    const timestamp = updatedAt ? new Date(updatedAt) : new Date();

    const updateData: any = {
      updatedAt: timestamp
    };

    if (newChinese !== undefined) updateData.chinese = newChinese;
    if (newEnglishMeaning !== undefined) updateData.meaningInEnglish = newEnglishMeaning;
    if (newChineseMeaning !== undefined) updateData.meaningInChinese = newChineseMeaning;

    const result = await prisma.translation.update({
      where: { id: BigInt(id) },
      data: updateData
    });

    return {
      id: Number(result.id),
      english: result.english,
      chinese: result.chinese,
      meaning_in_english: result.meaningInEnglish,
      meaning_in_chinese: result.meaningInChinese,
      created_at: result.createdAt.toISOString(),
      updated_at: result.updatedAt.toISOString()
    };
  } catch (error) {
    console.error('Error updating translation:', error);
    throw new Error('Failed to update translation');
  }
};

export default {
  addTranslation,
  getAllTranslations,
  deleteTranslation,
  updateTranslation,
};
