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

    /// @notice Address of the CampaignFactory — allowed to authorise escrow minters
    /// alongside the owner, so newly deployed escrows can mint automatically
    address public campaignFactory;

    /// @notice Number of milestones the creator has completed
    mapping(address => uint256) public reputationScore;

    /// @notice Total USDC (6 decimals) the creator has earned across milestones.
    /// A raw milestone count is cheap to farm — one person can play brand and
    /// creator with two wallets and a few cents of USDC — so reputation is also
    /// reported weighted by what was actually paid.
    mapping(address => uint256) public totalEarned;

    /// @notice Number of distinct brands that have paid the creator. Farming
    /// this needs a separate funded brand wallet per point, which makes
    /// self-dealing visible: high milestone counts from one or two brands.
    mapping(address => uint256) public uniqueBrandCount;

    /// @notice creator => brand => whether that brand has paid the creator before
    mapping(address => mapping(address => bool)) public hasWorkedWith;

    /// @notice Tracks token metadata per tokenId
    /// tokenId => IPFS metadata URI
    mapping(uint256 => string) public tokenMetadataURIs;

    /// @notice Records each mint event for on-chain history
    struct MintRecord {
        uint256 campaignId;
        uint256 milestoneIndex;
        uint256 tokenId;
        uint256 mintedAt;
        address escrow;
        address brand;
        uint256 value;
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
        uint256 mintedAt,
        address escrow,
        address brand,
        uint256 value
    );

    event MinterAuthorised(address indexed escrowAddress);
    event MinterRevoked(address indexed escrowAddress);
    event CampaignFactorySet(address indexed factory);

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

    /// @notice Only the contract owner or the registered CampaignFactory
    modifier onlyOwnerOrFactory() {
        require(
            msg.sender == owner() || msg.sender == campaignFactory,
            "ReputationToken: caller is not owner or factory"
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
    /// @param brand          The brand that paid for the milestone
    /// @param value          USDC paid for the milestone (6 decimals)
    function mint(
        address to,
        uint256 milestoneIndex,
        uint256 campaignId,
        address brand,
        uint256 value
    ) external override onlyAuthorisedMinter {
        require(to != address(0), "ReputationToken: mint to zero address");
        require(to != brand, "ReputationToken: creator cannot be brand");

        // Keyed on the calling escrow, not the campaign ID. Campaign IDs restart
        // at 1 whenever the factory is redeployed, so (campaignId, milestone)
        // would collide with tokens minted under the previous factory.
        uint256 tokenId = _deriveTokenId(msg.sender, milestoneIndex);
        require(balanceOf(to, tokenId) == 0, "ReputationToken: already minted");

        _mint(to, tokenId, 1, "");

        reputationScore[to]++;
        totalEarned[to] += value;
        if (!hasWorkedWith[to][brand]) {
            hasWorkedWith[to][brand] = true;
            uniqueBrandCount[to]++;
        }

        mintHistory[to].push(MintRecord({
            campaignId: campaignId,
            milestoneIndex: milestoneIndex,
            tokenId: tokenId,
            mintedAt: block.timestamp,
            escrow: msg.sender,
            brand: brand,
            value: value
        }));

        emit ReputationMinted(
            to,
            campaignId,
            tokenId,
            milestoneIndex,
            block.timestamp,
            msg.sender,
            brand,
            value
        );
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
    function authoriseMinter(address escrowAddress)
        external
        override
        onlyOwnerOrFactory
    {
        require(escrowAddress != address(0), "ReputationToken: invalid address");
        authorisedMinters[escrowAddress] = true;
        emit MinterAuthorised(escrowAddress);
    }

    /// @notice Sets the CampaignFactory address allowed to authorise escrow minters.
    /// Called once after deployment so the factory can auto-authorise each escrow.
    function setCampaignFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "ReputationToken: invalid factory address");
        campaignFactory = _factory;
        emit CampaignFactorySet(_factory);
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

    /// @notice Returns the creator's reputation in one call
    /// @return milestones   Milestones completed
    /// @return earned       Total USDC earned (6 decimals)
    /// @return uniqueBrands Distinct brands that have paid the creator
    function getReputation(address creator)
        external
        view
        returns (uint256 milestones, uint256 earned, uint256 uniqueBrands)
    {
        return (reputationScore[creator], totalEarned[creator], uniqueBrandCount[creator]);
    }

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

    /// @notice Derives a unique token ID from the escrow address and milestone
    /// index. Escrow addresses never repeat, so neither do token IDs.
    function _deriveTokenId(
        address escrow,
        uint256 milestoneIndex
    ) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(escrow, milestoneIndex)));
    }
}