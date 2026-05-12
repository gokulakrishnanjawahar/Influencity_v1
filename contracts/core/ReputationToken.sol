// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IReputationToken.sol";

/// @title ReputationToken
/// @notice Soulbound ERC-1155 reputation token.
/// Minted to creator wallets on every milestone completion.
/// Non-transferable — reputation cannot be bought or sold.
/// Metadata stored on IPFS via web3.storage.
contract ReputationToken is ERC1155, Ownable, IReputationToken {

    // ─────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────

    /// @notice Name of the token collection
    string public name = "Influencity Reputation";

    /// @notice Symbol of the token collection
    string public symbol = "IREP";

    /// @notice Mapping of authorised minters (CampaignEscrow contracts)
    /// Only escrows deployed by CampaignFactory are added here
    mapping(address => bool) public authorisedMinters;

    /// @notice Tracks total tokens minted per creator wallet
    mapping(address => uint256) public reputationScore;

    /// @notice Tracks token metadata per tokenId
    /// tokenId => IPFS metadata URI
    mapping(uint256 => string) public tokenMetadataURIs;

    /// @notice Records each mint event for on-chain history
    struct MintRecord {
        uint256 campaignId;
        uint256 milestoneIndex;
        uint256 tokenId;
        uint256 mintedAt;
    }

    /// @notice creator wallet => list of all their mint records
    mapping(address => MintRecord[]) public mintHistory;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event ReputationMinted(
        address indexed creator,
        uint256 indexed campaignId,
        uint256 indexed tokenId,
        uint256 milestoneIndex,
        uint256 mintedAt
    );

    event MinterAuthorised(address indexed escrowAddress);
    event MinterRevoked(address indexed escrowAddress);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /// @param _baseURI  Base IPFS gateway URI for token metadata
    /// e.g. "https://w3s.link/ipfs/"
    constructor(string memory _baseURI) ERC1155(_baseURI) Ownable(msg.sender) {}

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    /// @notice Only authorised CampaignEscrow contracts can mint
    modifier onlyAuthorisedMinter() {
        require(
            authorisedMinters[msg.sender],
            "ReputationToken: caller is not an authorised minter"
        );
        _;
    }

    // ─────────────────────────────────────────────
    // Minting
    // ─────────────────────────────────────────────

    /// @notice Mints a soulbound reputation token to the creator.
    /// Called by CampaignEscrow when a milestone is met.
    /// @param to             Creator wallet address
    /// @param milestoneIndex Index of the completed milestone
    /// @param campaignId     ID of the campaign
    function mint(
        address to,
        uint256 milestoneIndex,
        uint256 campaignId
    ) external override onlyAuthorisedMinter {
        require(to != address(0), "ReputationToken: mint to zero address");

        // Derive token ID from campaign and milestone
        // This gives each milestone across all campaigns a unique token type
        uint256 tokenId = _deriveTokenId(campaignId, milestoneIndex);

        // Mint 1 token of this type to the creator
        _mint(to, tokenId, 1, "");

        // Update reputation score
        reputationScore[to]++;

        // Record mint history
        mintHistory[to].push(MintRecord({
            campaignId: campaignId,
            milestoneIndex: milestoneIndex,
            tokenId: tokenId,
            mintedAt: block.timestamp
        }));

        emit ReputationMinted(to, campaignId, tokenId, milestoneIndex, block.timestamp);
    }

    /// @notice Sets the IPFS metadata URI for a specific token ID.
    /// Called after minting to link the token to its IPFS metadata.
    /// @param tokenId      The token ID to set metadata for
    /// @param metadataURI  Full IPFS URI e.g. "https://w3s.link/ipfs/bafyXXX"
    function setTokenMetadataURI(
        uint256 tokenId,
        string memory metadataURI
    ) external onlyOwner {
        tokenMetadataURIs[tokenId] = metadataURI;
    }

    // ─────────────────────────────────────────────
    // Soulbound — Block All Transfers
    // ─────────────────────────────────────────────

    /// @notice Override transfer hook to block all token transfers.
    /// Tokens can only be minted (from == address(0)), never moved.
    /// This makes the token soulbound — permanently tied to the creator wallet.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        // Allow minting (from == address(0)) but block all transfers and burns
        require(
            from == address(0),
            "ReputationToken: tokens are soulbound and cannot be transferred"
        );
        super._update(from, to, ids, values);
    }

    // ─────────────────────────────────────────────
    // Admin — Minter Management
    // ─────────────────────────────────────────────

    /// @notice Authorises a CampaignEscrow contract to mint tokens.
    /// Called by CampaignFactory after deploying a new escrow.
    /// @param escrowAddress Address of the CampaignEscrow contract
    function authoriseMinter(address escrowAddress) external onlyOwner {
        require(escrowAddress != address(0), "ReputationToken: invalid address");
        authorisedMinters[escrowAddress] = true;
        emit MinterAuthorised(escrowAddress);
    }

    /// @notice Revokes minting rights from an escrow (e.g. if campaign is cancelled)
    /// @param escrowAddress Address of the CampaignEscrow contract
    function revokeMinter(address escrowAddress) external onlyOwner {
        authorisedMinters[escrowAddress] = false;
        emit MinterRevoked(escrowAddress);
    }

    // ─────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────

    /// @notice Returns full mint history for a creator wallet
    function getMintHistory(address creator) external view returns (MintRecord[] memory) {
        return mintHistory[creator];
    }

    /// @notice Returns the metadata URI for a token ID
    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenURI = tokenMetadataURIs[tokenId];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }
        // Fallback to base URI
        return super.uri(tokenId);
    }

    // ─────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────

    /// @notice Derives a unique token ID from campaign ID and milestone index.
    /// Uses hashing to avoid collisions across campaigns.
    function _deriveTokenId(
        uint256 campaignId,
        uint256 milestoneIndex
    ) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(campaignId, milestoneIndex)));
    }
}