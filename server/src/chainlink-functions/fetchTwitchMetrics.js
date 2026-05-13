// ─────────────────────────────────────────────
// Chainlink Functions Script — Twitch Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (passed in `args` from the smart contract):
//   args[0] = Twitch content ID
//             For clips: clip slug (e.g. "TastyBraveAardvarkPRChase-abc123")
//             For streams: broadcaster login name (e.g. "shroud")
//   args[1] = metric type string: "CLIP_VIEWS" | "CONCURRENT_VIEWERS" | "FOLLOWERS"
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.twitchClientId     = Twitch app Client ID
//   secrets.twitchClientSecret = Twitch app Client Secret
//
// Returns:
//   uint256 — the requested metric value
//
// Note: Twitch requires a fresh OAuth2 app access token per request.
// We fetch the token first, then use it for the actual metric call.
// ─────────────────────────────────────────────

// 1. Extract arguments
const contentId = args[0];
const metricType = args[1] || "CLIP_VIEWS";

if (!contentId || contentId.length === 0) {
  throw Error("Twitch content ID is required as args[0]");
}

// 2. Validate secrets
if (!secrets.twitchClientId || !secrets.twitchClientSecret) {
  throw Error("Twitch credentials not provided in secrets");
}

// ─────────────────────────────────────────────
// Step 1 — Get OAuth2 App Access Token
// ─────────────────────────────────────────────
// Twitch requires a fresh token per request.
// App access tokens don't require a logged-in user — just client credentials.

const tokenRequest = Functions.makeHttpRequest({
  url: "https://id.twitch.tv/oauth2/token",
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  data: `client_id=${secrets.twitchClientId}&client_secret=${secrets.twitchClientSecret}&grant_type=client_credentials`,
  timeout: 5000,
});

const tokenResponse = await tokenRequest;

if (tokenResponse.error || !tokenResponse.data || !tokenResponse.data.access_token) {
  throw Error("Failed to obtain Twitch access token");
}

const accessToken = tokenResponse.data.access_token;

// ─────────────────────────────────────────────
// Step 2 — Fetch the Requested Metric
// ─────────────────────────────────────────────

let metricValue = 0;

if (metricType === "CLIP_VIEWS") {
  // Fetch clip view count by clip slug
  // API docs: https://dev.twitch.tv/docs/api/reference/#get-clips
  const clipRequest = Functions.makeHttpRequest({
    url: "https://api.twitch.tv/helix/clips",
    method: "GET",
    headers: {
      "Client-Id": secrets.twitchClientId,
      "Authorization": `Bearer ${accessToken}`,
    },
    params: {
      id: contentId,
    },
    timeout: 5000,
  });

  const clipResponse = await clipRequest;

  if (clipResponse.error) {
    throw Error(`Twitch clips API error: ${clipResponse.message || "unknown"}`);
  }

  const clipData = clipResponse.data;

  if (!clipData || !clipData.data || clipData.data.length === 0) {
    throw Error(`No clip found for ID: ${contentId}`);
  }

  metricValue = parseInt(clipData.data[0].view_count || "0", 10);
  console.log(`Clip ${contentId} → views: ${metricValue}`);

} else if (metricType === "CONCURRENT_VIEWERS") {
  // Fetch live stream viewer count by broadcaster login
  // Returns 0 if the streamer is offline (not an error)
  // API docs: https://dev.twitch.tv/docs/api/reference/#get-streams
  const streamRequest = Functions.makeHttpRequest({
    url: "https://api.twitch.tv/helix/streams",
    method: "GET",
    headers: {
      "Client-Id": secrets.twitchClientId,
      "Authorization": `Bearer ${accessToken}`,
    },
    params: {
      user_login: contentId,
    },
    timeout: 5000,
  });

  const streamResponse = await streamRequest;

  if (streamResponse.error) {
    throw Error(`Twitch streams API error: ${streamResponse.message || "unknown"}`);
  }

  const streamData = streamResponse.data;

  // If stream is offline, data array is empty — viewer count is 0
  if (!streamData || !streamData.data || streamData.data.length === 0) {
    metricValue = 0;
    console.log(`Broadcaster ${contentId} is offline — viewer count: 0`);
  } else {
    metricValue = parseInt(streamData.data[0].viewer_count || "0", 10);
    console.log(`Broadcaster ${contentId} → concurrent viewers: ${metricValue}`);
  }

} else if (metricType === "FOLLOWERS") {
  // Fetch total follower count for a channel
  // API docs: https://dev.twitch.tv/docs/api/reference/#get-channel-followers
  const userRequest = Functions.makeHttpRequest({
    url: "https://api.twitch.tv/helix/users",
    method: "GET",
    headers: {
      "Client-Id": secrets.twitchClientId,
      "Authorization": `Bearer ${accessToken}`,
    },
    params: {
      login: contentId,
    },
    timeout: 5000,
  });

  const userResponse = await userRequest;

  if (userResponse.error || !userResponse.data?.data?.[0]) {
    throw Error(`Twitch user not found: ${contentId}`);
  }

  const broadcasterId = userResponse.data.data[0].id;

  const followerRequest = Functions.makeHttpRequest({
    url: "https://api.twitch.tv/helix/channels/followers",
    method: "GET",
    headers: {
      "Client-Id": secrets.twitchClientId,
      "Authorization": `Bearer ${accessToken}`,
    },
    params: {
      broadcaster_id: broadcasterId,
    },
    timeout: 5000,
  });

  const followerResponse = await followerRequest;

  if (followerResponse.error) {
    throw Error(`Twitch followers API error: ${followerResponse.message || "unknown"}`);
  }

  metricValue = parseInt(followerResponse.data?.total || "0", 10);
  console.log(`Channel ${contentId} → followers: ${metricValue}`);

} else {
  throw Error(`Unsupported metric type: ${metricType}. Use CLIP_VIEWS, CONCURRENT_VIEWERS, or FOLLOWERS`);
}

// ─────────────────────────────────────────────
// Step 3 — Validate and Return
// ─────────────────────────────────────────────

if (metricValue < 0 || metricValue > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid metric value returned: ${metricValue}`);
}

// Return encoded uint256 to be decoded on-chain by MetricsConsumer
return Functions.encodeUint256(metricValue);