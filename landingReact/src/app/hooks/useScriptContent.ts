import { useEffect, useState } from "react";
import { readScriptContent } from "../api";
import { createHighlighterCore, HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import githubDark from "shiki/themes/github-dark-default.mjs";
import ahk2Grammar from "../syntaxes/ahk2.tmLanguage.json";

let shikiPromise: Promise<HighlighterCore> | null = null;
function getShiki(): Promise<HighlighterCore> {
  if (!shikiPromise) {
    shikiPromise = createHighlighterCore({
      themes: [githubDark],
      langs: [ahk2Grammar as any],
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return shikiPromise;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface UseScriptContentResult {
  html: string[] | null;
  source: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useScriptContent(scriptPath: string | null): UseScriptContentResult {
  const [source, setSource] = useState<string | null>(null);
  const [html, setHtml] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load source
  useEffect(() => {
    if (!scriptPath) {
      setSource(null);
      setHtml(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setSource(null);
    setHtml(null);
    setError(null);
    readScriptContent(scriptPath).then(c => {
      if (cancelled) return;
      setSource(c);
      setIsLoading(false);
    }).catch(e => {
      if (cancelled) return;
      setSource(null);
      setError(String(e));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [scriptPath]);

  // Highlight
  useEffect(() => {
    if (!source) { setHtml(null); return; }
    const plain = source.split("\n").map(escapeHtml);
    setHtml(plain);
    let cancelled = false;
    getShiki().then(shiki => {
      if (cancelled) return;
      try {
        const tokens = shiki.codeToTokensBase(source, { lang: "autohotkey2" });
        setHtml(tokens.map(line =>
          line.map(token => {
            const color = token.color && token.color !== "#e1e4e8" ? ` style="color:${token.color}"` : "";
            const escaped = escapeHtml(token.content);
            return color ? `<span${color}>${escaped}</span>` : escaped;
          }).join("")
        ));
      } catch (e) {
        console.error("Shiki highlight error:", e);
      }
    });
    return () => { cancelled = true; };
  }, [source]);

  return { html: html as any, source, isLoading, error };
}
