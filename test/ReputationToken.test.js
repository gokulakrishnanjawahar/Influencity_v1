import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

// ─────────────────────────────────────────────
// ReputationToken Tests
// ─────────────────────────────────────────────

describe("ReputationToken", async () => {
  let ethers;
  let reputationToken;
  let owner;
  let escrowMock;
  let creator;
  let other;
  let brand;
  let otherBrand;
  let otherEscrow;

  const BASE_URI = "https://w3s.link/ipfs/";
  const VALUE = 100_000_000n; // 100 USDC

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    [owner, escrowMock, creator, other, brand, otherBrand, otherEscrow] =
      await ethers.getSigners();

    const ReputationToken = await ethers.getContractFactory("ReputationToken");
    reputationToken = await ReputationToken.deploy(BASE_URI);
  }

  // ─────────────────────────────────────────────
  // Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", async () => {
    before(deployAll);

    it("sets correct name and symbol", async () => {
      assert.equal(await reputationToken.name(), "Influencity Reputation");
      assert.equal(await reputationToken.symbol(), "IREP");
    });

    it("sets owner to deployer", async () => {
      assert.equal(await reputationToken.owner(), owner.address);
    });

    it("starts with no authorised minters", async () => {
      assert.equal(await reputationToken.authorisedMinters(escrowMock.address), false);
    });
  });

  // ─────────────────────────────────────────────
  // Minter Management
  // ─────────────────────────────────────────────

  describe("Minter Management", async () => {
    beforeEach(deployAll);

    it("allows owner to authorise a minter", async () => {
      await reputationToken.authoriseMinter(escrowMock.address);
      assert.equal(await reputationToken.authorisedMinters(escrowMock.address), true);
    });

    it("reverts if a non-owner, non-factory tries to authorise minter", async () => {
      await assert.rejects(
        reputationToken.connect(other).authoriseMinter(escrowMock.address),
        /caller is not owner or factory/
      );
    });

    it("allows the registered campaign factory to authorise a minter", async () => {
      // The factory authorises each escrow it deploys, so it must be able to
      // call authoriseMinter without being the owner. `other` stands in for
      // the factory address here.
      await reputationToken.setCampaignFactory(other.address);
      await reputationToken.connect(other).authoriseMinter(escrowMock.address);

      assert.equal(await reputationToken.authorisedMinters(escrowMock.address), true);
    });

    it("reverts if a non-owner tries to set the campaign factory", async () => {
      await assert.rejects(
        reputationToken.connect(other).setCampaignFactory(other.address),
        /OwnableUnauthorizedAccount/
      );
    });

    it("reverts on zero address minter", async () => {
      await assert.rejects(
        reputationToken.authoriseMinter("0x0000000000000000000000000000000000000000"),
        /invalid address/
      );
    });

    it("allows owner to revoke a minter", async () => {
      await reputationToken.authoriseMinter(escrowMock.address);
      await reputationToken.revokeMinter(escrowMock.address);
      assert.equal(await reputationToken.authorisedMinters(escrowMock.address), false);
    });

    it("emits MinterAuthorised event", async () => {
      const tx = await reputationToken.authoriseMinter(escrowMock.address);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "MinterAuthorised"
      );
      assert.ok(event, "MinterAuthorised event not emitted");
      assert.equal(event.args.escrowAddress, escrowMock.address);
    });
  });

  // ─────────────────────────────────────────────
  // Minting
  // ─────────────────────────────────────────────

  describe("Minting", async () => {
    beforeEach(async () => {
      await deployAll();
      await reputationToken.authoriseMinter(escrowMock.address);
    });

    it("mints token to creator on milestone completion", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      assert.equal(await reputationToken.reputationScore(creator.address), 1n);
    });

    it("increments reputation score on each mint", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 2, 1, brand.address, VALUE);
      assert.equal(await reputationToken.reputationScore(creator.address), 3n);
    });

    it("records mint history", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1, brand.address, VALUE);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.equal(history.length, 2);
      assert.equal(history[0].campaignId, 1n);
      assert.equal(history[0].milestoneIndex, 0n);
      assert.equal(history[1].milestoneIndex, 1n);
    });

    it("refuses to mint the same escrow milestone twice", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await assert.rejects(
        reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE),
        /already minted/
      );
    });

    // Regression: token IDs used to be keccak(campaignId, milestoneIndex).
    // Campaign IDs restart at 1 when the factory is redeployed, so two different
    // escrows reporting campaign 1, milestone 0 minted the same token ID.
    it("gives different escrows different token IDs for the same campaign ID", async () => {
      await reputationToken.authoriseMinter(otherEscrow.address);
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(otherEscrow).mint(creator.address, 0, 1, brand.address, VALUE);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.notEqual(history[0].tokenId, history[1].tokenId);
      assert.equal(history[0].escrow, escrowMock.address);
      assert.equal(history[1].escrow, otherEscrow.address);
    });

    it("derives the token ID from the escrow address and milestone index", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 3, 1, brand.address, VALUE);
      const [record] = await reputationToken.getMintHistory(creator.address);
      const expected = BigInt(
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256"],
            [escrowMock.address, 3]
          )
        )
      );
      assert.equal(record.tokenId, expected);
    });

    it("refuses to mint to the brand that paid", async () => {
      await assert.rejects(
        reputationToken.connect(escrowMock).mint(brand.address, 0, 1, brand.address, VALUE),
        /creator cannot be brand/
      );
    });

    it("reverts if non-authorised caller tries to mint", async () => {
      await assert.rejects(
        reputationToken.connect(other).mint(creator.address, 0, 1, brand.address, VALUE),
        /caller is not an authorised minter/
      );
    });

    it("reverts on mint to zero address", async () => {
      await assert.rejects(
        reputationToken
          .connect(escrowMock)
          .mint("0x0000000000000000000000000000000000000000", 0, 1, brand.address, VALUE),
        /mint to zero address/
      );
    });

    it("emits ReputationMinted event", async () => {
      const tx = await reputationToken
        .connect(escrowMock)
        .mint(creator.address, 0, 1, brand.address, VALUE);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "ReputationMinted"
      );
      assert.ok(event, "ReputationMinted event not emitted");
      assert.equal(event.args.creator, creator.address);
      assert.equal(event.args.campaignId, 1n);
      assert.equal(event.args.milestoneIndex, 0n);
    });
  });

  // ─────────────────────────────────────────────
  // Weighted Reputation
  // ─────────────────────────────────────────────
  // A bare milestone count is cheap to farm with two wallets, so reputation is
  // also reported by value earned and by how many distinct brands paid.

  describe("Weighted Reputation", async () => {
    beforeEach(async () => {
      await deployAll();
      await reputationToken.authoriseMinter(escrowMock.address);
    });

    it("sums the USDC earned across milestones", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1, brand.address, 50n);
      assert.equal(await reputationToken.totalEarned(creator.address), VALUE + 50n);
    });

    it("counts each paying brand once", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1, brand.address, VALUE);
      assert.equal(await reputationToken.uniqueBrandCount(creator.address), 1n);

      await reputationToken.connect(escrowMock).mint(creator.address, 2, 1, otherBrand.address, VALUE);
      assert.equal(await reputationToken.uniqueBrandCount(creator.address), 2n);
    });

    it("returns milestones, earnings and brands from getReputation", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1, otherBrand.address, VALUE);

      const [milestones, earned, uniqueBrands] =
        await reputationToken.getReputation(creator.address);
      assert.equal(milestones, 2n);
      assert.equal(earned, 2n * VALUE);
      assert.equal(uniqueBrands, 2n);
    });

    it("records brand and value in the mint history", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);
      const [record] = await reputationToken.getMintHistory(creator.address);
      assert.equal(record.brand, brand.address);
      assert.equal(record.value, VALUE);
    });
  });

  // ─────────────────────────────────────────────
  // Soulbound — Non-Transferable
  // ─────────────────────────────────────────────

  describe("Soulbound (Non-Transferable)", async () => {
    let tokenId;

    beforeEach(async () => {
      await deployAll();
      await reputationToken.authoriseMinter(escrowMock.address);
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);

      const history = await reputationToken.getMintHistory(creator.address);
      tokenId = history[0].tokenId;
    });

    it("reverts on safeTransferFrom", async () => {
      await assert.rejects(
        reputationToken
          .connect(creator)
          .safeTransferFrom(creator.address, other.address, tokenId, 1, "0x"),
        /tokens are soulbound and cannot be transferred/
      );
    });

    it("reverts on safeBatchTransferFrom", async () => {
      await assert.rejects(
        reputationToken
          .connect(creator)
          .safeBatchTransferFrom(creator.address, other.address, [tokenId], [1], "0x"),
        /tokens are soulbound and cannot be transferred/
      );
    });

    it("creator still holds the token after attempted transfer", async () => {
      const balance = await reputationToken.balanceOf(creator.address, tokenId);
      assert.equal(balance, 1n);
    });
  });

  // ─────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────

  describe("Metadata", async () => {
    let tokenId;

    beforeEach(async () => {
      await deployAll();
      await reputationToken.authoriseMinter(escrowMock.address);
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1, brand.address, VALUE);

      const history = await reputationToken.getMintHistory(creator.address);
      tokenId = history[0].tokenId;
    });

    it("returns base URI when no specific URI set", async () => {
      const uri = await reputationToken.uri(tokenId);
      assert.equal(uri, BASE_URI);
    });

    it("allows owner to set token-specific metadata URI", async () => {
      const customUri = "https://w3s.link/ipfs/bafymetadataXYZ";
      await reputationToken.setTokenMetadataURI(tokenId, customUri);
      assert.equal(await reputationToken.uri(tokenId), customUri);
    });

    it("reverts if non-owner tries to set metadata URI", async () => {
      await assert.rejects(
        reputationToken.connect(other).setTokenMetadataURI(tokenId, "https://example.com/"),
        /OwnableUnauthorizedAccount/
      );
    });
  });
});