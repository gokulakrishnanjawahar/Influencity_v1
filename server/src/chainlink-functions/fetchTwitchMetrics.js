// ─────────────────────────────────────────────
// Chainlink Functions Script — Twitch Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (built by MetricsConsumer.requestMetric from the milestone):
//   args[0] = content ID — a clip ID for VIEWS, the channel login otherwise
//   args[1] = metric type: "VIEWS" | "CONCURRENT_VIEWERS" | "FOLLOWERS"
//   args[2] = the creator's Twitch login (e.g. "somestreamer")
//   args[3] = the creator's wallet address, lowercase hex
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.twitchClientId     = Twitch application client ID
//   secrets.twitchClientSecret = Twitch application client secret
//
// Ownership: the reading is only returned if the content belongs to args[2]
// AND that channel's bio contains the creator's wallet address.
//
// Returns:
//   uint256 — the requested metric
// ─────────────────────────────────────────────

const [contentId, metricType, channelLogin, creatorAddress] = args;

if (!contentId || !metricType || !channelLogin || !creatorAddress) {
  throw Error("Expected args: contentId, metricType, channelLogin, creatorAddress");
}

if (!secrets.twitchClientId || !secrets.twitchClientSecret) {
  throw Error("Twitch credentials not provided in secrets");
}

// ─────────────────────────────────────────────
// App access token — client credentials, no logged-in user needed
// ─────────────────────────────────────────────

const tokenResponse = await Functions.makeHttpRequest({
  url: "https://id.twitch.tv/oauth2/token",
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  data: `client_id=${secrets.twitchClientId}&client_secret=${secrets.twitchClientSecret}&grant_type=client_credentials`,
  timeout: 3000,
});

if (tokenResponse.error || !tokenResponse.data?.access_token) {
  throw Error("Failed to obtain Twitch access token");
}

const accessToken = tokenResponse.data.access_token;

// API docs: https://dev.twitch.tv/docs/api/reference
async function helix(path, params) {
  const response = await Functions.makeHttpRequest({
    url: `https://api.twitch.tv/helix/${path}`,
    method: "GET",
    headers: {
      "Client-Id": secrets.twitchClientId,
      "Authorization": `Bearer ${accessToken}`,
    },
    params,
    timeout: 3000,
  });
  if (response.error) {
    throw Error(`Twitch ${path} request failed: ${response.message || "unknown"}`);
  }
  return response.data;
}

// ─────────────────────────────────────────────
// Proof of control: the channel bio must contain the creator's wallet
// ─────────────────────────────────────────────

const user = (await helix("users", { login: channelLogin }))?.data?.[0];
if (!user) {
  throw Error(`Twitch user not found: ${channelLogin}`);
}
if (!(user.description || "").toLowerCase().includes(creatorAddress.toLowerCase())) {
  throw Error(`Channel ${channelLogin} bio does not contain ${creatorAddress}`);
}

// Channel-level metrics measure the creator's own channel and nothing else
if (metricType !== "VIEWS" && contentId.toLowerCase() !== channelLogin.toLowerCase()) {
  throw Error(`${metricType} milestones must measure the creator's own channel`);
}

// ─────────────────────────────────────────────
// Fetch the requested metric
// ─────────────────────────────────────────────

let metricValue;

if (metricType === "VIEWS") {
  const clip = (await helix("clips", { id: contentId }))?.data?.[0];
  if (!clip) {
    throw Error(`No clip found for ID: ${contentId}`);
  }
  if (clip.broadcaster_id !== user.id) {
    throw Error(`Clip ${contentId} is not from channel ${channelLogin}`);
  }
  metricValue = parseInt(clip.view_count || "0", 10);
} else if (metricType === "CONCURRENT_VIEWERS") {
  // An offline stream returns no data — a reading of 0, not an error
  const stream = (await helix("streams", { user_id: user.id }))?.data?.[0];
  metricValue = stream ? parseInt(stream.viewer_count || "0", 10) : 0;
} else if (metricType === "FOLLOWERS") {
  const followers = await helix("channels/followers", { broadcaster_id: user.id });
  metricValue = parseInt(followers?.total || "0", 10);
} else {
  throw Error(`Unsupported Twitch metric: ${metricType}. Use VIEWS, CONCURRENT_VIEWERS or FOLLOWERS`);
}

console.log(`${metricType} for ${contentId} on ${channelLogin}: ${metricValue}`);

if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid metric value: ${metricValue}`);
}

// MetricsConsumer.sol decodes this with abi.decode(response, (uint256))
return Functions.encodeUint256(metricValue);
