import { useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import translationService from '@/services/translationService';

/**
 * Component that automatically translates all text content in the DOM
 * Works by observing DOM changes and translating text nodes
 */
export const AutoTranslate = () => {
  const { currentLanguage } = useLanguage();
  const observerRef = useRef(null);
  const translatedNodesRef = useRef(new WeakSet());
  const processingRef = useRef(false);
  const queueRef = useRef([]);

  // Elements to skip (don't translate)
  const shouldSkipElement = useCallback((element) => {
    if (!element) return false;

    // Skip script, style, code elements
    if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT'].includes(element.tagName)) {
      return true;
    }

    // Skip input values (only translate placeholders)
    if (['INPUT', 'TEXTAREA'].includes(element.tagName)) {
      return true;
    }

    // Skip if element or any ancestor has data-no-translate attribute
    let el = element;
    while (el && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute('data-no-translate')) {
        return true;
      }
      el = el.parentElement;
    }

    return false;
  }, []);

  // Extract translatable text from a text node
  const getTranslatableText = useCallback((text) => {
    // Trim whitespace
    const trimmed = text.trim();
    
    // Skip if empty, only whitespace, or only special characters
    if (!trimmed || /^[\s\d\p{P}\p{S}]+$/u.test(trimmed)) {
      return null;
    }

    // Skip if it looks like a URL or email
    if (/^(https?:\/\/|www\.|[a-z0-9._%+-]+@)/i.test(trimmed)) {
      return null;
    }

    // Skip if already translated (contains common translation patterns)
    if (translatedNodesRef.current.has(text)) {
      return null;
    }

    return trimmed;
  }, []);

  // Translate a batch of text nodes
  const translateBatch = useCallback(async (items) => {
    if (items.length === 0 || currentLanguage === 'en') return;

    const textsToTranslate = items.map(item => item.text);
    
    try {
      const translations = await translationService.translateBatch(
        textsToTranslate,
        currentLanguage,
        'en'
      );

      items.forEach((item, index) => {
        const translatedText = translations[index];
        if (translatedText && translatedText !== item.text) {
          // Handle attribute translation
          if (item.node.__element && item.node.__attr) {
            item.node.__element.setAttribute(item.node.__attr, translatedText);
          } else {
            // Handle text node translation
            item.node.textContent = translatedText;
            translatedNodesRef.current.add(item.node);
          }
        }
      });
    } catch (error) {
      console.error('Batch translation error:', error);
    }
  }, [currentLanguage]);

  // Process queued translations
  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;
    
    // Process multiple batches in parallel for faster translation
    const batches = [];
    while (queueRef.current.length > 0) {
      batches.push(queueRef.current.splice(0, 100)); // Larger batches, process 100 at a time
    }

    // Process all batches in parallel
    await Promise.all(batches.map(batch => translateBatch(batch)));

    processingRef.current = false;
  }, [translateBatch]);

  // Translate text nodes in an element
  const translateElement = useCallback((element) => {
    if (shouldSkipElement(element)) return;

    // Translate text nodes
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent should be skipped
          if (shouldSkipElement(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if already translated
          if (translatedNodesRef.current.has(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = getTranslatableText(node.textContent);
          return text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = getTranslatableText(node.textContent);
      if (text) {
        nodes.push({ node, text });
      }
    }

    if (nodes.length > 0) {
      queueRef.current.push(...nodes);
      processQueue();
    }

    // Translate common attributes
    const attributesToTranslate = ['placeholder', 'title', 'aria-label', 'alt'];
    attributesToTranslate.forEach(attr => {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        const text = getTranslatableText(value);
        if (text) {
          queueRef.current.push({
            node: { 
              textContent: value,
              __element: element,
              __attr: attr
            },
            text
          });
        }
      }
    });
  }, [shouldSkipElement, getTranslatableText, processQueue]);

  // Initial translation on mount and language change
  useEffect(() => {
    if (currentLanguage === 'en') {
      // Reset if switching back to English
      translatedNodesRef.current = new WeakSet();
      return;
    }

    // Clear previous translations when language changes
    translatedNodesRef.current = new WeakSet();
    queueRef.current = [];

    // Translate existing content immediately
    document.querySelectorAll('body *').forEach(element => {
      translateElement(element);
    });
  }, [currentLanguage, translateElement]);

  // Set up mutation observer for dynamic content
  useEffect(() => {
    if (currentLanguage === 'en') return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Handle added nodes
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            translateElement(node);
          } else if (node.nodeType === Node.TEXT_NODE) {
            const text = getTranslatableText(node.textContent);
            if (text && !translatedNodesRef.current.has(node)) {
              queueRef.current.push({ node, text });
              processQueue();
            }
          }
        });

        // Handle character data changes
        if (mutation.type === 'characterData') {
          const text = getTranslatableText(mutation.target.textContent);
          if (text && !translatedNodesRef.current.has(mutation.target)) {
            queueRef.current.push({ node: mutation.target, text });
            processQueue();
          }
        }

        // Handle attribute changes
        if (mutation.type === 'attributes') {
          const element = mutation.target;
          const attr = mutation.attributeName;
          if (['placeholder', 'title', 'aria-label', 'alt'].includes(attr)) {
            const value = element.getAttribute(attr);
            const text = getTranslatableText(value);
            if (text) {
              queueRef.current.push({
                node: {
                  textContent: value,
                  __element: element,
                  __attr: attr
                },
                text
              });
              processQueue();
            }
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt']
    });

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [currentLanguage, translateElement, getTranslatableText, processQueue]);

  // This component doesn't render anything
  return null;
};

export default AutoTranslate;
