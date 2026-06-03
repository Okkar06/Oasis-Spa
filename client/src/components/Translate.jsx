import { useEffect, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslate';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Component that automatically translates its children text content
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to translate
 * @param {string} props.sourceLanguage - Source language (default: 'en')
 * @param {string[]} props.keys - For object/array children, specify keys to translate
 * @returns {React.ReactNode} Translated content
 */
export const Translate = ({ children, sourceLanguage = 'en', keys = null }) => {
  const { translate, translateObject, translateArray, targetLanguage } = useTranslate();
  const { currentLanguage } = useLanguage();
  const [translatedContent, setTranslatedContent] = useState(children);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    const performTranslation = async () => {
      // Don't translate if target language is English
      if (currentLanguage === 'en' || !children) {
        setTranslatedContent(children);
        return;
      }

      setIsTranslating(true);

      try {
        // Handle different types of children
        if (typeof children === 'string') {
          // Simple string translation
          const translated = await translate(children, sourceLanguage);
          setTranslatedContent(translated);
        } else if (Array.isArray(children)) {
          // Array of strings
          if (children.every(child => typeof child === 'string')) {
            const translated = await translateArray(
              children.map(text => ({ text })),
              ['text'],
              sourceLanguage
            );
            setTranslatedContent(translated.map(item => item.text));
          } else {
            setTranslatedContent(children);
          }
        } else if (typeof children === 'object' && children !== null && keys) {
          // Object with specified keys
          const translated = await translateObject(children, keys, sourceLanguage);
          setTranslatedContent(translated);
        } else {
          // Unsupported type, return as-is
          setTranslatedContent(children);
        }
      } catch (error) {
        console.error('Translation error in Translate component:', error);
        setTranslatedContent(children);
      } finally {
        setIsTranslating(false);
      }
    };

    performTranslation();
  }, [children, currentLanguage, sourceLanguage, keys, translate, translateObject, translateArray]);

  return translatedContent;
};

/**
 * Hook version for use in functional components
 * Automatically translates text when target language changes
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language (default: 'en')
 * @returns {Object} { translatedText, isTranslating }
 */
export const useTranslateText = (text, sourceLanguage = 'en') => {
  const { translate } = useTranslate();
  const { currentLanguage } = useLanguage();
  const [translatedText, setTranslatedText] = useState(text);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    const performTranslation = async () => {
      if (currentLanguage === 'en' || !text) {
        setTranslatedText(text);
        return;
      }

      setIsTranslating(true);
      try {
        const translated = await translate(text, sourceLanguage);
        setTranslatedText(translated);
      } catch (error) {
        console.error('Translation error:', error);
        setTranslatedText(text);
      } finally {
        setIsTranslating(false);
      }
    };

    performTranslation();
  }, [text, currentLanguage, sourceLanguage, translate]);

  return { translatedText, isTranslating };
};

export default Translate;
