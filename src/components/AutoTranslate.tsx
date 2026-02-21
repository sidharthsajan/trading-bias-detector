import { useEffect, useRef } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateUiText } from '@/lib/translations';

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'] as const;

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  const tag = parent.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT';
}

export default function AutoTranslate() {
  const { language } = useLanguage();
  const textSourceRef = useRef(new WeakMap<Text, string>());
  const attributeSourceRef = useRef(new WeakMap<Element, Partial<Record<(typeof TRANSLATABLE_ATTRIBUTES)[number], string>>>());

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const translateAttributes = (element: Element) => {
      for (const attr of TRANSLATABLE_ATTRIBUTES) {
        const value = element.getAttribute(attr);
        if (value === null) continue;

        const originals = attributeSourceRef.current.get(element);
        const storedSource = originals?.[attr];

        if (language === 'en') {
          if (storedSource !== undefined && value !== storedSource) {
            element.setAttribute(attr, storedSource);
          }
          continue;
        }

        let source = storedSource;
        if (source === undefined) {
          source = value;
        } else {
          const translatedStoredSource = translateUiText(source, 'fr');
          if (value !== translatedStoredSource) {
            // Underlying UI changed while in FR mode; treat latest value as new source text.
            source = value;
          }
        }

        const translated = translateUiText(source, language);
        const nextOriginals = originals ?? {};
        nextOriginals[attr] = source;
        if (!originals) {
          attributeSourceRef.current.set(element, nextOriginals);
        }

        if (translated !== value) {
          element.setAttribute(attr, translated);
        }
      }
    };

    const translateText = (node: Text) => {
      if (shouldSkipTextNode(node)) return;
      const value = node.nodeValue ?? '';
      const storedSource = textSourceRef.current.get(node);

      if (language === 'en') {
        if (storedSource !== undefined && value !== storedSource) {
          node.nodeValue = storedSource;
        }
        return;
      }

      let source = storedSource;
      if (source === undefined) {
        source = value;
      } else {
        const translatedStoredSource = translateUiText(source, 'fr');
        if (value !== translatedStoredSource) {
          // Underlying UI changed while in FR mode; keep tracking the new source.
          source = value;
        }
      }

      textSourceRef.current.set(node, source);
      const translated = translateUiText(source, language);

      if (translated !== value) {
        node.nodeValue = translated;
      }
    };

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        translateText(node as Text);
        return;
      }

      if (!(node instanceof Element)) {
        return;
      }

      translateAttributes(node);

      for (const child of node.childNodes) {
        walk(child);
      }
    };

    walk(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          translateText(mutation.target as Text);
          continue;
        }

        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          translateAttributes(mutation.target);
          continue;
        }

        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            walk(node);
          }
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
    };
  }, [language]);

  return null;
}
