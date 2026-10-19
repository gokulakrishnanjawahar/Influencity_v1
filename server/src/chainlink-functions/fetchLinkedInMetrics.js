// ─────────────────────────────────────────────
// Chainlink Functions Script — LinkedIn Metrics
// ─────────────────────────────────────────────
//
// Runs on each Chainlink Functions node independently.
// Nodes reach consensus on the result before posting it on-chain.
//
// Arguments (built by MetricsConsumer.requestMetric from the milestone):
//   args[0] = post URN, e.g. "urn:li:share:7123456789012345678"
//   args[1] = metric type: "VIEWS" (impressions) | "CLICKS"
//   args[2] = the creator's organisation URN, e.g. "urn:li:organization:123"
//   args[3] = the creator's wallet address, lowercase hex
//
// Secrets (passed encrypted via DON-hosted secrets):
//   secrets.linkedinAccessToken = LinkedIn OAuth2 access token
//                                 (from Marketing API OAuth flow)
//
// Ownership: statistics are requested scoped to args[2], so LinkedIn only
// returns them for a post that organisation published. The organisation's
// description must also contain the creator's wallet address.
//
// Returns:
//   uint256 — the requested metric
// ─────────────────────────────────────────────

const [postUrn, metricType, organizationUrn, creatorAddress] = args;

if (!postUrn || !metricType || !organizationUrn || !creatorAddress) {
  throw Error("Expected args: postUrn, metricType, organizationUrn, creatorAddress");
}

if (metricType !== "VIEWS" && metricType !== "CLICKS") {
  throw Error(`Unsupported LinkedIn metric: ${metricType}. Use VIEWS or CLICKS`);
}

if (!secrets.linkedinAccessToken) {
  throw Error("LinkedIn access token not provided in secrets.linkedinAccessToken");
}

const organizationId = organizationUrn.split(":").pop();
if (!/^\d+$/.test(organizationId)) {
  throw Error(`Not an organisation URN: ${organizationUrn}`);
}

const headers = {
  "Authorization": `Bearer ${secrets.linkedinAccessToken}`,
  "LinkedIn-Version": "202304",
  "X-Restli-Protocol-Version": "2.0.0",
};

// ─────────────────────────────────────────────
// Proof of control: the organisation description must contain the wallet
// ─────────────────────────────────────────────

const orgResponse = await Functions.makeHttpRequest({
  url: `https://api.linkedin.com/rest/organizations/${organizationId}`,
  method: "GET",
  headers,
  timeout: 4000,
});

if (orgResponse.error || !orgResponse.data) {
  throw Error(`LinkedIn organisation lookup failed: ${orgResponse.message || "unknown"}`);
}

const description = (orgResponse.data.localizedDescription || "").toLowerCase();
if (!description.includes(creatorAddress.toLowerCase())) {
  throw Error(`Organisation ${organizationUrn} description does not contain ${creatorAddress}`);
}

// ─────────────────────────────────────────────
// Post statistics, scoped to the creator's organisation
// ─────────────────────────────────────────────
// API docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/share-statistics-api

const statsResponse = await Functions.makeHttpRequest({
  url: "https://api.linkedin.com/rest/organizationalEntityShareStatistics",
  method: "GET",
  headers,
  params: {
    q: "organizationalEntity",
    organizationalEntity: organizationUrn,
    shares: `List(${encodeURIComponent(postUrn)})`,
  },
  timeout: 4000,
});

if (statsResponse.error) {
  throw Error(`LinkedIn statistics request failed: ${statsResponse.message || "unknown"}`);
}

const element = statsResponse.data?.elements?.[0];
if (!element || element.organizationalEntity !== organizationUrn) {
  throw Error(`No statistics for ${postUrn} under ${organizationUrn}`);
}

const stats = element.totalShareStatistics || {};
const metricValue = metricType === "VIEWS"
  ? parseInt(stats.impressionCount || "0", 10)
  : parseInt(stats.clickCount || "0", 10);

console.log(`${metricType} for ${postUrn} under ${organizationUrn}: ${metricValue}`);

if (!Number.isFinite(metricValue) || metricValue < 0 || metricValue > Number.MAX_SAFE_INTEGER) {
  throw Error(`Invalid metric value: ${metricValue}`);
}

// MetricsConsumer.sol decodes this with abi.decode(response, (uint256))
return Functions.encodeUint256(metricValue);
