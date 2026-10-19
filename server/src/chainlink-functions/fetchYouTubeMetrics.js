// ─────────────────────────────────────────────
// Chainlink Functions Script — YouTube Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (built by MetricsConsumer.requestMetric from the milestone):
//   args[0] = content ID — a video ID for VIEWS, the channel ID for FOLLOWERS
//   args[1] = metric type: "VIEWS" | "FOLLOWERS"
//   args[2] = the creator's channel ID (e.g. "UCuAXFkgsw1L7xaCfnd5JJOw")
//   args[3] = the creator's wallet address, lowercase hex
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.youtubeApiKey = YouTube Data API v3 key
//
// Ownership: the reading is only returned if the video belongs to args[2] AND
// that channel's description contains the creator's wallet address. Without
// both checks a creator could point the milestone at anyone's viral video.
//
// Returns:
//   uint256 — the requested metric
// ─────────────────────────────────────────────

const [contentId, metricType, channelId, creatorAddress] = args;

if (!contentId || !metricType || !channelId || !creatorAddress) {
  throw Error("Expected args: contentId, metricType, channelId, creatorAddress");
}

if (!secrets.youtubeApiKey) {
  throw Error("YouTube API key not provided in secrets.youtubeApiKey");
}

// API docs: https://developers.google.com/youtube/v3/docs
async function youtube(resource, params) {
  const response = await Functions.makeHttpRequest({
    url: `https://www.googleapis.com/youtube/v3/${resource}`,
    method: "GET",
    params: { ...params, key: secrets.youtubeApiKey },
    timeout: 4000, // two calls must fit inside Functions' ~10s budget
  });
  if (response.error) {
    throw Error(`YouTube ${resource} request failed: ${response.message || "unknown"}`);
  }
  const item = response.data?.items?.[0];
  if (!item) {
    throw Error(`YouTube ${resource}: nothing found for ${params.id}`);
  }
  return item;
}

let metricValue;

if (metricType === "VIEWS") {
  const video = await youtube("videos", { part: "snippet,statistics", id: contentId });
  if (video.snippet.channelId !== channelId) {
    throw Error(`Video ${contentId} is not on channel ${channelId}`);
  }
  metricValue = parseInt(video.statistics.viewCount || "0", 10);
} else if (metricType === "FOLLOWERS") {
  if (contentId !== channelId) {
    throw Error("FOLLOWERS milestones must measure the creator's own channel");
  }
} else {
  throw Error(`Unsupported YouTube metric: ${metricType}. Use VIEWS or FOLLOWERS`);
}

// Proof of control: the creator must have put their wallet address in the
// channel description, which only the channel's owner can edit.
const channel = await youtube("channels", { part: "snippet,statistics", id: channelId });
const description = (channel.snippet.description || "").toLowerCase();
if (!description.includes(creatorAddress.toLowerCase())) {
  throw Error(`Channel ${channelId} description does not contain ${creatorAddress}`);
}

if (metricType === "FOLLOWERS") {
  metricValue = parseInt(channel.statistics.subscriberCount || "0", 10);
}

console.log(`${metricType} for ${contentId} on ${channelId}: ${metricValue}`);

if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid metric value: ${metricValue}`);
}

// MetricsConsumer.sol decodes this with abi.decode(response, (uint256))
return Functions.encodeUint256(metricValue);
