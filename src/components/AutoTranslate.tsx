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
      let originals = attributeSourceRef.current.get(element);

      for (const attr of TRANSLATABLE_ATTRIBUTES) {
        const value = element.getAttribute(attr);
        if (value === null) continue;

        if (!originals) {
          originals = {};
          attributeSourceRef.current.set(element, originals);
        }

        if (originals[attr] === undefined) {
          originals[attr] = value;
        }

        const source = originals[attr] ?? value;
        const translated = translateUiText(source, language);
        if (translated !== value) {
          element.setAttribute(attr, translated);
        }
      }
    };

    const translateText = (node: Text) => {
      if (shouldSkipTextNode(node)) return;
      const value = node.nodeValue ?? '';

      if (!textSourceRef.current.has(node)) {
        textSourceRef.current.set(node, value);
      }

      const source = textSourceRef.current.get(node) ?? value;
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
