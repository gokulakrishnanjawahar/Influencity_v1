// ─────────────────────────────────────────────
// Chainlink Functions Script — LinkedIn Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (passed in `args` from the smart contract):
//   args[0] = LinkedIn post URN (URL encoded)
//             e.g. "urn:li:share:7123456789012345678"
//             or   "urn:li:ugcPost:7123456789012345678"
//   args[1] = metric type string: "IMPRESSIONS" | "CLICKS" | "ENGAGEMENT"
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.linkedinAccessToken = LinkedIn OAuth2 access token
//                                 (from Marketing API OAuth flow)
//
// Returns:
//   uint256 — the requested metric value
//
// Note: LinkedIn Marketing API returns engagement rate as a float (e.g. 0.045).
// We multiply by 10000 and return as uint256 to preserve 4 decimal places.
// e.g. 4.5% engagement = 450 on-chain. Smart contract milestones must
// use this scaled value when setting thresholds.
// ─────────────────────────────────────────────

// 1. Extract arguments
const postUrn = args[0];
const metricType = args[1] || "IMPRESSIONS";

if (!postUrn || postUrn.length === 0) {
  throw Error("LinkedIn post URN is required as args[0]");
}

// 2. Validate secrets
if (!secrets.linkedinAccessToken) {
  throw Error("LinkedIn access token not provided in secrets.linkedinAccessToken");
}

// 3. URL-encode the URN for use in query params
// LinkedIn URNs contain colons which must be encoded in URLs
const encodedUrn = encodeURIComponent(postUrn);

// ─────────────────────────────────────────────
// Step 1 — Fetch Post Analytics from LinkedIn
// ─────────────────────────────────────────────
// LinkedIn Marketing API — Share Statistics endpoint
// API docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/share-statistics-api

const analyticsRequest = Functions.makeHttpRequest({
  url: "https://api.linkedin.com/v2/organizationalEntityShareStatistics",
  method: "GET",
  headers: {
    "Authorization": `Bearer ${secrets.linkedinAccessToken}`,
    "LinkedIn-Version": "202304",
    "X-Restli-Protocol-Version": "2.0.0",
  },
  params: {
    q: "organizationalEntity",
    shares: `List(${encodedUrn})`,
  },
  timeout: 8000,
});

const analyticsResponse = await analyticsRequest;

// 4. Handle API errors
if (analyticsResponse.error) {
  console.error("LinkedIn API request failed:", analyticsResponse.error);
  throw Error(`LinkedIn API error: ${analyticsResponse.message || "unknown"}`);
}

const data = analyticsResponse.data;

// 5. Validate response shape
if (!data || !data.elements || data.elements.length === 0) {
  throw Error(`No analytics found for URN: ${postUrn}`);
}

const stats = data.elements[0].totalShareStatistics;

if (!stats) {
  throw Error(`No share statistics returned for URN: ${postUrn}`);
}

// ─────────────────────────────────────────────
// Step 2 — Extract the Requested Metric
// ─────────────────────────────────────────────

let metricValue = 0;

if (metricType === "IMPRESSIONS") {
  // Total number of times the post was shown to LinkedIn members
  metricValue = parseInt(stats.impressionCount || "0", 10);
  console.log(`Post ${postUrn} → impressions: ${metricValue}`);

} else if (metricType === "CLICKS") {
  // Total number of clicks on the post (links, company name, likes, comments)
  metricValue = parseInt(stats.clickCount || "0", 10);
  console.log(`Post ${postUrn} → clicks: ${metricValue}`);

} else if (metricType === "ENGAGEMENT") {
  // Engagement rate = (clicks + likes + comments + shares) / impressions
  // LinkedIn may return this directly, or we calculate it
  if (stats.engagement !== undefined) {
    // LinkedIn returns engagement as a float e.g. 0.045 = 4.5%
    // Multiply by 10000 to preserve 4 decimal places as uint256
    // e.g. 4.5% → 450, 0.123% → 12
    const engagementRate = parseFloat(stats.engagement || "0");
    metricValue = Math.floor(engagementRate * 10000);
    console.log(`Post ${postUrn} → engagement rate: ${engagementRate} (scaled: ${metricValue})`);
  } else {
    // Calculate manually if not provided directly
    const impressions = parseInt(stats.impressionCount || "0", 10);
    const interactions =
      parseInt(stats.clickCount || "0", 10) +
      parseInt(stats.likeCount || "0", 10) +
      parseInt(stats.commentCount || "0", 10) +
      parseInt(stats.shareCount || "0", 10);

    if (impressions === 0) {
      metricValue = 0;
    } else {
      const rate = interactions / impressions;
      metricValue = Math.floor(rate * 10000);
    }
    console.log(`Post ${postUrn} → calculated engagement (scaled): ${metricValue}`);
  }

} else {
  throw Error(`Unsupported metric type: ${metricType}. Use IMPRESSIONS, CLICKS, or ENGAGEMENT`);
}

// ─────────────────────────────────────────────
// Step 3 — Validate and Return
// ─────────────────────────────────────────────

if (metricValue < 0 || metricValue > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid metric value: ${metricValue}`);
}

// Return encoded uint256 to be decoded on-chain by MetricsConsumer
return Functions.encodeUint256(metricValue);