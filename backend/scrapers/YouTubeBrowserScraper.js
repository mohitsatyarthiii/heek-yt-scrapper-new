import { chromium } from "playwright";

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

const IGNORE_EMAIL_DOMAINS = [
  "youtube.com", "google.com", "googleapis.com", "gstatic.com",
  "ytimg.com", "ggpht.com", "example.com", "sentry.io",
  "w3.org", "schema.org", "wix.com", "squarespace.com",
];

function extractEmail(text) {
  if (!text) return null;
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const email of matches) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && !IGNORE_EMAIL_DOMAINS.some((d) => domain.endsWith(d))) {
      return email;
    }
  }
  return null;
}

function parseSubCount(text) {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/subscribers?/i, "").trim();
  const match = clean.match(/([\d.]+)\s*(k|m|b)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "k") return Math.round(num * 1_000);
  return Math.round(num);
}

export class YouTubeBrowserScraper {
  constructor() {
    this.browser = null;
    this.ownsBrowser = false;
  }

  async init(externalBrowser = null) {
    if (externalBrowser) {
      this.browser = externalBrowser;
      this.ownsBrowser = false;
    } else {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      this.ownsBrowser = true;
    }
  }

  async scrape(keyword, { minSubs = 0, targetCount = 100, country, proxy, shouldStop, onProgress, onLog }) {
    if (!this.browser) await this.init();

    const log = onLog || (() => {});
    const context = await this.browser.newContext({
      ...(proxy ? { proxy } : {}),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const results = [];

    try {
      // Search YouTube for channels (sp=EgIQAg%3D%3D filters to Channels)
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%3D%3D`;
      log(`Navigating to YouTube search: ${keyword}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);

      // Dismiss consent dialog if present
      try {
        const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")');
        if (await consentBtn.first().isVisible({ timeout: 3000 })) {
          await consentBtn.first().click();
          await page.waitForTimeout(1000);
        }
      } catch { /* no consent dialog */ }

      // Scroll to collect channel links
      let channelUrls = new Set();
      let scrollAttempts = 0;
      const maxScrolls = Math.min(30, Math.ceil(targetCount / 5));

      while (channelUrls.size < targetCount * 3 && scrollAttempts < maxScrolls) {
        if (shouldStop && await shouldStop()) break;

        const links = await page.$$eval(
          'a[href*="/@"], a[href*="/channel/"]',
          (anchors) => {
            const seen = new Set();
            return anchors
              .map((a) => a.href)
              .filter((href) => {
                // Only keep channel-level URLs
                const match = href.match(/youtube\.com\/((@[^/]+)|(channel\/[^/]+))/);
                if (!match || seen.has(match[1])) return false;
                seen.add(match[1]);
                return true;
              })
              .map((href) => {
                const match = href.match(/youtube\.com\/((@[^/]+)|(channel\/[^/]+))/);
                return `https://www.youtube.com/${match[1]}`;
              });
          }
        );

        for (const url of links) channelUrls.add(url);

        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1000 + Math.random() * 1000);
        scrollAttempts++;
      }

      log(`Found ${channelUrls.size} channel links for "${keyword}"`);

      // Visit each channel's about page to extract email
      for (const channelUrl of channelUrls) {
        if (shouldStop && await shouldStop()) break;
        if (results.length >= targetCount) break;

        try {
          const aboutUrl = channelUrl.replace(/\/$/, "") + "/about";
          await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(3000 + Math.random() * 2000);

          const channelData = await page.evaluate(() => {
            // Title — try multiple selectors (YT layout changes frequently)
            const title =
              document.querySelector("ytd-channel-name #text")?.textContent?.trim() ||
              document.querySelector("#channel-name")?.textContent?.trim() ||
              document.querySelector("yt-dynamic-text-view-model .yt-core-attributed-string")?.textContent?.trim() ||
              document.querySelector("h1")?.textContent?.trim() ||
              "";

            // Subscriber count — primary: yt-content-metadata-view-model spans
            // The spans contain items like "@handle", "•", "15.5M subscribers", "•", "4.4K videos"
            let subsText = "";
            const metaSpans = document.querySelectorAll("yt-content-metadata-view-model span");
            for (const span of metaSpans) {
              const t = span.textContent?.trim() || "";
              if (/subscribers?/i.test(t)) {
                subsText = t;
                break;
              }
            }
            // Fallback to old selectors
            if (!subsText) {
              subsText =
                document.querySelector("#subscriber-count")?.textContent?.trim() ||
                document.querySelector("yt-formatted-string#subscriber-count")?.textContent?.trim() ||
                "";
            }

            // Description — gather text from ALL possible sources
            const descParts = [];

            // 1. #description-container (older layout)
            const descContainer = document.querySelector("#description-container")?.textContent;
            if (descContainer) descParts.push(descContainer);

            // 2. #description (about page)
            const descEl = document.querySelector("#description")?.textContent;
            if (descEl) descParts.push(descEl);

            // 3. ytd-channel-about-metadata-renderer #description
            const aboutDesc = document.querySelector("ytd-channel-about-metadata-renderer #description")?.textContent;
            if (aboutDesc) descParts.push(aboutDesc);

            // 4. yt-attributed-string spans (current YT layout — this is where emails often live)
            const attrStrings = document.querySelectorAll("yt-attributed-string span");
            const attrText = Array.from(attrStrings).map((s) => s.textContent).join(" ");
            if (attrText) descParts.push(attrText);

            // 5. about-channel-renderer section
            const aboutSection = document.querySelector("about-channel-renderer")?.textContent;
            if (aboutSection) descParts.push(aboutSection);

            // 6. Links in about/link sections
            const linksEls = document.querySelectorAll(
              "ytd-channel-about-metadata-renderer a, #link-list-container a, a[href*='mailto:']"
            );
            const linksText = Array.from(linksEls).map((a) => (a.textContent || "") + " " + (a.href || "")).join(" ");
            if (linksText) descParts.push(linksText);

            // 7. Final fallback: page body text (emails are ALWAYS in here if they exist)
            const bodyText = document.body?.innerText?.substring(0, 5000) || "";
            descParts.push(bodyText);

            const description = descParts.join(" ");

            // Channel ID from canonical URL or page data
            const canonicalEl = document.querySelector('link[rel="canonical"]');
            const canonical = canonicalEl?.href || window.location.href;

            // Country — try details section or meta spans
            let country = "";
            const detailsEl = document.querySelector('#details-container yt-formatted-string:last-child, [id*="country"]');
            if (detailsEl) country = detailsEl.textContent?.trim() || "";

            return { title, subsText, description, canonical, country };
          });

          // Parse subscriber count
          const subs = parseSubCount(channelData.subsText);
          if (subs < minSubs) continue;

          // Extract email
          const email = extractEmail(channelData.description);
          if (!email) continue;

          // Extract channelId from URL
          let channelId = "";
          const idMatch = channelData.canonical.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
          if (idMatch) {
            channelId = idMatch[1];
          } else {
            const handleMatch = channelData.canonical.match(/@([a-zA-Z0-9._-]+)/);
            channelId = handleMatch ? `@${handleMatch[1]}` : channelUrl;
          }

          results.push({
            channelId,
            keyword,
            title: channelData.title,
            subscribers: subs,
            views: 0,
            videos: 0,
            country: channelData.country,
            email,
            source: "youtube-browser",
            platform: "youtube",
            profileUrl: channelUrl,
          });

          log(`Found email for: ${channelData.title} (${subs.toLocaleString()} subs)`);
          if (onProgress) onProgress(results.length);
        } catch (err) {
          // Skip this channel on error
        }

        // Rate limiting: 2-5 second random delay
        await page.waitForTimeout(2000 + Math.random() * 3000);
      }
    } finally {
      await context.close();
    }

    return results;
  }

  async cleanup() {
    if (this.browser && this.ownsBrowser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
