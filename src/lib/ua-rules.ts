export const UA_RULES_VERSION = 1;

export const UA_CLASSES = [
  "ai_crawler",
  "ai_user_fetch",
  "http_library",
  "headless_browser",
  "browser",
  "search_crawler",
  "link_preview",
  "unrecognised",
] as const;

export type UaClass = (typeof UA_CLASSES)[number];

export const UA_FAMILIES = [
  "gptbot",
  "claudebot",
  "google_extended",
  "perplexitybot",
  "ccbot",
  "chatgpt_user",
  "claude_user",
  "perplexity_user",
  "python_requests",
  "httpx",
  "aiohttp",
  "node_fetch",
  "axios",
  "curl",
  "wget",
  "go_http_client",
  "headless_chrome",
  "playwright",
  "puppeteer",
  "chrome",
  "firefox",
  "safari",
  "edge",
  "googlebot",
  "bingbot",
  "duckduckbot",
  "slackbot",
  "twitterbot",
  "facebookexternalhit",
  "discordbot",
  "linkedinbot",
  "unrecognised",
] as const;

export type UaFamily = (typeof UA_FAMILIES)[number];

type Rule = {
  pattern: RegExp;
  uaClass: UaClass;
  uaFamily: UaFamily;
};

/** First match wins. Order matters: more specific before generic. */
const RULES: Rule[] = [
  { pattern: /Google-Extended/i, uaClass: "ai_crawler", uaFamily: "google_extended" },
  { pattern: /GPTBot/i, uaClass: "ai_crawler", uaFamily: "gptbot" },
  { pattern: /ClaudeBot/i, uaClass: "ai_crawler", uaFamily: "claudebot" },
  { pattern: /PerplexityBot/i, uaClass: "ai_crawler", uaFamily: "perplexitybot" },
  { pattern: /CCBot/i, uaClass: "ai_crawler", uaFamily: "ccbot" },
  { pattern: /ChatGPT-User/i, uaClass: "ai_user_fetch", uaFamily: "chatgpt_user" },
  { pattern: /Claude-User/i, uaClass: "ai_user_fetch", uaFamily: "claude_user" },
  { pattern: /Perplexity-User/i, uaClass: "ai_user_fetch", uaFamily: "perplexity_user" },
  { pattern: /python-requests/i, uaClass: "http_library", uaFamily: "python_requests" },
  { pattern: /httpx/i, uaClass: "http_library", uaFamily: "httpx" },
  { pattern: /aiohttp/i, uaClass: "http_library", uaFamily: "aiohttp" },
  { pattern: /node-fetch/i, uaClass: "http_library", uaFamily: "node_fetch" },
  { pattern: /axios\//i, uaClass: "http_library", uaFamily: "axios" },
  { pattern: /\bcurl\//i, uaClass: "http_library", uaFamily: "curl" },
  { pattern: /\bwget\//i, uaClass: "http_library", uaFamily: "wget" },
  { pattern: /Go-http-client/i, uaClass: "http_library", uaFamily: "go_http_client" },
  { pattern: /HeadlessChrome/i, uaClass: "headless_browser", uaFamily: "headless_chrome" },
  { pattern: /Playwright/i, uaClass: "headless_browser", uaFamily: "playwright" },
  { pattern: /Puppeteer/i, uaClass: "headless_browser", uaFamily: "puppeteer" },
  { pattern: /Googlebot/i, uaClass: "search_crawler", uaFamily: "googlebot" },
  { pattern: /bingbot/i, uaClass: "search_crawler", uaFamily: "bingbot" },
  { pattern: /DuckDuckBot/i, uaClass: "search_crawler", uaFamily: "duckduckbot" },
  { pattern: /Slackbot/i, uaClass: "link_preview", uaFamily: "slackbot" },
  { pattern: /Twitterbot/i, uaClass: "link_preview", uaFamily: "twitterbot" },
  { pattern: /facebookexternalhit/i, uaClass: "link_preview", uaFamily: "facebookexternalhit" },
  { pattern: /Discordbot/i, uaClass: "link_preview", uaFamily: "discordbot" },
  { pattern: /LinkedInBot/i, uaClass: "link_preview", uaFamily: "linkedinbot" },
  { pattern: /Edg\//i, uaClass: "browser", uaFamily: "edge" },
  { pattern: /Chrome\//i, uaClass: "browser", uaFamily: "chrome" },
  { pattern: /Firefox\//i, uaClass: "browser", uaFamily: "firefox" },
  { pattern: /Safari\//i, uaClass: "browser", uaFamily: "safari" },
];

export function classifyUserAgent(uaHeader: string | null): {
  uaClass: UaClass;
  uaFamily: UaFamily;
  uaRulesVersion: number;
} {
  const ua = uaHeader ?? "";
  for (const rule of RULES) {
    if (rule.pattern.test(ua)) {
      return {
        uaClass: rule.uaClass,
        uaFamily: rule.uaFamily,
        uaRulesVersion: UA_RULES_VERSION,
      };
    }
  }
  return {
    uaClass: "unrecognised",
    uaFamily: "unrecognised",
    uaRulesVersion: UA_RULES_VERSION,
  };
}

/**
 * Product tokens for robots.txt Allow groups (user-initiated agent fetchers).
 * Derived from every `ai_user_fetch` rule. Patterns for that class must be
 * literal product names (e.g. `Claude-User`) so robots.txt cannot drift.
 */
export function aiUserFetchRobotsUserAgents(): string[] {
  const agents: string[] = [];
  for (const rule of RULES) {
    if (rule.uaClass !== "ai_user_fetch") continue;
    const name = rule.pattern.source;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      throw new Error(
        `ai_user_fetch robots User-agent must be a literal product token, got ${JSON.stringify(name)}`,
      );
    }
    agents.push(name);
  }
  return agents;
}
