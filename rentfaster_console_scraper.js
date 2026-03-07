/*
Paste this into the browser console on a live RentFaster search results page.

What it does:
- extracts listing_id, url, title, location, price, and photo from each page
- waits for lazy-loaded cards to finish rendering before scraping
- retries incomplete cards after a short delay
- visits every property detail page in-process and uses it as the source of truth
- clicks through result pages
- deduplicates by listing id
- downloads a JSON file when finished

How to use:
1. Open the RentFaster search results page in Chrome/Edge.
2. Open DevTools -> Console.
3. Paste this script and press Enter.
4. Leave the tab focused while it runs.

To stop it safely midway, run this in the console:
window.__stopRentFasterScrape = true
*/

(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const seen = new Set();
  const listings = [];
  window.__stopRentFasterScrape = false;

  function shouldStop() {
    return Boolean(window.__stopRentFasterScrape);
  }

  function clean(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function normalizePrice(text) {
    const value = clean(text || "");
    if (!value) {
      return null;
    }

    return value.startsWith("$") ? value : `$${value}`;
  }

  function firstText(root, selectors) {
    for (const selector of selectors) {
      const text = clean(root.querySelector(selector)?.textContent || "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function firstHref(root, selectors) {
    for (const selector of selectors) {
      const href = root.querySelector(selector)?.href || "";
      if (href) {
        return href;
      }
    }

    return "";
  }

  async function scrollToBottom() {
    let lastHeight = -1;
    let stablePasses = 0;

    while (stablePasses < 3) {
      if (shouldStop()) {
        return;
      }

      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      await wait(1500);

      const currentHeight = document.body.scrollHeight;
      if (currentHeight === lastHeight) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
        lastHeight = currentHeight;
      }
    }
  }

  async function waitForCardsToRender(timeoutMs = 10000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (shouldStop()) {
        return;
      }

      const cards = Array.from(document.querySelectorAll(".listing-item[listingid], .listing-item"));

      if (!cards.length) {
        await wait(400);
        continue;
      }

      const readyCards = cards.filter((card) => {
        const listingId =
          card.getAttribute("listingid") ||
          card.getAttribute("data-listingid") ||
          clean(card.querySelector('[class*="is-size-8"]')?.textContent || "").replace(/^ID\s+/i, "");
        const url = firstHref(card, ['a[href*="/properties/"]']);
        const headline = clean(card.querySelector("h4, h3")?.textContent || "");
        const price = clean(
          card.querySelector('[ng-bind="listing.price|formatPrice:true"]')?.textContent || ""
        );

        return Boolean(listingId && (headline || price || url));
      });

      if (readyCards.length >= Math.max(3, Math.floor(cards.length * 0.8))) {
        return;
      }

      await wait(500);
    }
  }

  function getVisibleListingIds() {
    return Array.from(document.querySelectorAll(".listing-item[listingid], .listing-item"))
      .map((card) => card.getAttribute("listingid") || card.getAttribute("data-listingid") || "")
      .filter(Boolean);
  }

  function getPageSignature() {
    return getVisibleListingIds().slice(0, 10).join("|");
  }

  function getCurrentPageNumber() {
    const current =
      document.querySelector('[aria-current="page"]') ||
      document.querySelector(".pagination .is-current, .pagination .active, .pager .active, .page-item.active");

    const currentText = clean(current?.textContent || "");
    if (/^\d+$/.test(currentText)) {
      return Number(currentText);
    }

    return null;
  }

  function extractListingId(card) {
    return (
      card.getAttribute("listingid") ||
      card.getAttribute("data-listingid") ||
      clean(card.querySelector('[class*="is-size-8"]')?.textContent || "").replace(/^ID\s+/i, "")
    );
  }

  function parseCard(card) {
    const listingId = extractListingId(card);

    if (!listingId || seen.has(listingId)) {
      return null;
    }

    const headlineNode = card.querySelector("h4, h3");
    const locationNode =
      headlineNode?.querySelector("small") ||
      card.querySelector('[class*="address"]') ||
      card.querySelector('[class*="location"]') ||
      card.querySelector('[class*="subtitle"]');

    const fullHeadlineText = clean(headlineNode?.textContent || "");
    const location = clean(locationNode?.textContent || "");

    let title = clean(fullHeadlineText.replace(location, ""));
    if (!title) {
      title =
        firstText(card, [
          "h4",
          "h3",
          '[class*="title"]',
          '[class*="headline"]',
          '[class*="name"]',
        ]) || null;
    }

    const priceNode =
      card.querySelector('[ng-bind="listing.price|formatPrice:true"]') ||
      Array.from(card.querySelectorAll("span, div")).find((el) =>
        /^\$?\d[\d,]*/.test(clean(el.textContent))
      );

    const photoNode =
      card.querySelector('img[alt*="Property photo"]') ||
      card.querySelector('img[src*="rentfaster"]');

    const url =
      firstHref(card, [
        'a[href*="/properties/"]',
        'a[href*="/listing/"]',
        'a[href*="/property/"]',
      ]) || null;

    return {
      listing_id: listingId,
      url,
      title: title || null,
      location: location || null,
      price: normalizePrice(priceNode?.textContent || ""),
      photo: photoNode?.currentSrc || photoNode?.src || null,
    };
  }

  async function parseCardWithRetry(card) {
    let listing = parseCard(card);

    if (listing && (!listing.title || !listing.location || !listing.url)) {
      if (shouldStop()) {
        return listing;
      }

      card.scrollIntoView({ behavior: "instant", block: "center" });
      await wait(900);
      listing = parseCard(card) || listing;
    }

    return listing;
  }

  function parseStructuredData(doc) {
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

    for (const script of scripts) {
      const text = script.textContent || "";
      if (!text.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          const candidate =
            item?.["@type"] === "Product" ||
            item?.["@type"] === "Apartment" ||
            item?.["@type"] === "Residence" ||
            item?.["@type"] === "House" ||
            item?.["@type"] === "SingleFamilyResidence" ||
            item?.["@type"] === "Offer"
              ? item
              : null;

          if (!candidate) {
            continue;
          }

          const address = candidate.address || candidate.itemOffered?.address || null;
          const title = clean(candidate.name || candidate.itemOffered?.name || "");
          const street = clean(address?.streetAddress || "");
          const locality = clean(address?.addressLocality || "");
          const region = clean(address?.addressRegion || "");
          const location = clean([street, locality, region].filter(Boolean).join(", "));

          return {
            title: title || null,
            location: location || null,
          };
        }
      } catch (error) {
        continue;
      }
    }

    return { title: null, location: null };
  }

  function parseDetailsHtml(html, url) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const structured = parseStructuredData(doc);

    const title =
      structured.title ||
      firstText(doc, [
        "h1",
        '[property="og:title"]',
        'meta[property="og:title"]',
        '[class*="title"]',
        '[class*="headline"]',
      ]) ||
      clean(doc.title.replace(/\s*\|\s*RentFaster.*$/i, ""));

    const metaTitle = clean(doc.querySelector('meta[property="og:title"]')?.content || "");
    const addressText =
      structured.location ||
      firstText(doc, [
        '[class*="address"]',
        '[class*="location"]',
        '[data-testid*="address"]',
        "address",
      ]);

    const inferredLocation = clean(
      addressText ||
        metaTitle.replace(title || "", "").replace(/^[\s,-]+|[\s,-]+$/g, "")
    );

    const photo =
      doc.querySelector('meta[property="og:image"]')?.content ||
      doc.querySelector('img[src*="rentfaster"]')?.src ||
      null;

    return {
      url,
      title: title || null,
      location: inferredLocation || null,
      photo,
    };
  }

  async function enrichListingsFromDetails() {
    const candidates = listings.filter((listing) => listing.url);
    let enrichedCount = 0;

    for (const [index, listing] of candidates.entries()) {
      if (shouldStop()) {
        console.log("Stop requested. Ending detail-page pass early.");
        return;
      }

      try {
        console.log(
          `Opening detail page ${index + 1}/${candidates.length} for ${listing.listing_id}...`
        );
        const response = await fetch(listing.url, {
          credentials: "include",
          headers: {
            Accept: "text/html,application/xhtml+xml",
          },
        });

        if (!response.ok) {
          console.log(`Detail fetch failed for ${listing.listing_id}: ${response.status}`);
          await wait(800);
          continue;
        }

        const html = await response.text();
        const details = parseDetailsHtml(html, listing.url);

        if (details.title) {
          listing.title = details.title;
        }
        if (details.location) {
          listing.location = details.location;
        }
        if (details.photo) {
          listing.photo = details.photo;
        }

        if (listing.title && listing.location) {
          enrichedCount += 1;
        }
      } catch (error) {
        console.log(`Failed to enrich ${listing.listing_id}:`, error);
      }

      await wait(900);
    }

    console.log(`Detail-page pass completed. ${enrichedCount} listings now have both title and location.`);
  }

  async function scrapeCurrentPage() {
    await waitForCardsToRender();

    const cards = Array.from(document.querySelectorAll(".listing-item[listingid], .listing-item"));
    let added = 0;

    for (const card of cards) {
      if (shouldStop()) {
        console.log("Stop requested. Ending page scrape early.");
        return added;
      }

      const listing = await parseCardWithRetry(card);
      if (!listing) {
        continue;
      }

      seen.add(listing.listing_id);
      listings.push(listing);
      added += 1;
    }

    const incompleteOnPage = listings.filter((listing) => !listing.title || !listing.location || !listing.url).length;
    console.log(`Page scraped: +${added}, total=${listings.length}, incomplete=${incompleteOnPage}`);
    return added;
  }

  function getNextCandidates() {
    const candidates = [];
    const currentPage = getCurrentPageNumber();
    const selectors = [
      'a[rel="next"]',
      'button[rel="next"]',
      '.pagination-next',
      'a[aria-label*="Next"]',
      'button[aria-label*="Next"]',
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        candidates.push(node);
      }
    }

    for (const node of Array.from(document.querySelectorAll("a, button"))) {
      const text = clean(node.textContent || "");
      const className = String(node.className || "");
      const ariaLabel = node.getAttribute("aria-label") || "";

      if (/next/i.test(text) || /next/i.test(ariaLabel)) {
        candidates.push(node);
        continue;
      }

      if (
        currentPage !== null &&
        /^\d+$/.test(text) &&
        Number(text) === currentPage + 1 &&
        /(page|pager|pagination)/i.test(className + " " + (node.parentElement?.className || ""))
      ) {
        candidates.push(node);
      }
    }

    return [...new Set(candidates)];
  }

  async function goToNextPage() {
    await scrollToBottom();

    if (shouldStop()) {
      return false;
    }

    const beforeUrl = location.href;
    const beforeSignature = getPageSignature();
    const candidates = getNextCandidates();

    if (!candidates.length) {
      console.log("No next-page candidates found.");
      return false;
    }

    console.log(
      "Next-page candidates:",
      candidates.map((node) => ({
        text: clean(node.textContent || ""),
        aria: node.getAttribute("aria-label"),
        className: node.className,
      }))
    );

    for (const nextButton of candidates) {
      if (shouldStop()) {
        return false;
      }

      nextButton.scrollIntoView({ behavior: "instant", block: "center" });
      nextButton.click();

      for (let i = 0; i < 20; i += 1) {
        if (shouldStop()) {
          return false;
        }

        await wait(1000);
        const afterUrl = location.href;
        const afterSignature = getPageSignature();
        if (afterUrl !== beforeUrl || (afterSignature && afterSignature !== beforeSignature)) {
          await wait(2500);
          await waitForCardsToRender();
          console.log(`Advanced page: urlChanged=${afterUrl !== beforeUrl}`);
          return true;
        }
      }
    }

    console.log("Tried next-page candidates, but the page content did not change.");
    return false;
  }

  function downloadResults() {
    const blob = new Blob([JSON.stringify(listings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rentfaster-listings-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  let pageCount = 0;

  while (true) {
    if (shouldStop()) {
      console.log("Stop requested. Ending listing-page pass early.");
      break;
    }

    pageCount += 1;
    await scrollToBottom();
    await waitForCardsToRender();
    console.log(`Scraping page ${pageCount}. URL=${location.href}`);

    const added = await scrapeCurrentPage();
    if (added === 0 && pageCount > 1) {
      console.log("No new listings found on this page, stopping.");
      break;
    }

    const moved = await goToNextPage();
    if (!moved) {
      break;
    }
  }

  await enrichListingsFromDetails();

  console.log(
    `Finished. Scraped ${listings.length} unique listings across ${pageCount} pages.`
  );
  downloadResults();
})();
