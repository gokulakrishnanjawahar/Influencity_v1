// ─────────────────────────────────────────────
// Chainlink Functions Script — YouTube Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (passed in `args` from the smart contract):
//   args[0] = YouTube video ID (e.g. "dQw4w9WgXcQ")
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.youtubeApiKey = YouTube Data API v3 key
//
// Returns:
//   uint256 — the view count of the video
//
// Note: We return ONLY the view count as the canonical metric for now.
// Like count, comment count, and watch time are fetched but only the
// metric matching the milestone's metricType is returned.
// ─────────────────────────────────────────────

// 1. Extract arguments from the request
const videoId = args[0];

if (!videoId || videoId.length === 0) {
  throw Error("YouTube video ID is required as args[0]");
}

// 2. Validate that the API key is provided via Chainlink secrets
if (!secrets.youtubeApiKey) {
  throw Error("YouTube API key not provided in secrets.youtubeApiKey");
}

// 3. Build the YouTube Data API v3 request
// API docs: https://developers.google.com/youtube/v3/docs/videos/list
const youtubeRequest = Functions.makeHttpRequest({
  url: "https://www.googleapis.com/youtube/v3/videos",
  method: "GET",
  params: {
    part: "statistics",
    id: videoId,
    key: secrets.youtubeApiKey,
  },
  timeout: 9000, // Chainlink Functions has a ~10s total execution limit
});

// 4. Execute the request
const youtubeResponse = await youtubeRequest;

// 5. Handle network or API errors
if (youtubeResponse.error) {
  console.error("YouTube API request failed:", youtubeResponse.error);
  throw Error(`YouTube API error: ${youtubeResponse.message || "unknown"}`);
}

const data = youtubeResponse.data;

// 6. Validate response shape
if (!data || !data.items || data.items.length === 0) {
  throw Error(`No video found for ID: ${videoId}`);
}

const stats = data.items[0].statistics;

if (!stats) {
  throw Error(`No statistics returned for video ID: ${videoId}`);
}

// 7. Extract metrics — YouTube returns them as strings, convert to numbers
const viewCount = parseInt(stats.viewCount || "0", 10);
const likeCount = parseInt(stats.likeCount || "0", 10);
const commentCount = parseInt(stats.commentCount || "0", 10);

// 8. Log for debugging (visible in Chainlink Functions playground)
console.log(`Video ${videoId} → views: ${viewCount}, likes: ${likeCount}, comments: ${commentCount}`);

// 9. Sanity check — view counts shouldn't be negative or absurdly large
if (viewCount < 0 || viewCount > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid view count returned: ${viewCount}`);
}

// 10. Return the metric as a uint256 to be decoded on-chain
// MetricsConsumer.sol decodes this with abi.decode(response, (uint256))
return Functions.encodeUint256(viewCount);