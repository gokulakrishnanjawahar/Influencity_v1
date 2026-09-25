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

  const BASE_URI = "https://w3s.link/ipfs/";

  async function deployAll() {
    const connection = await hre.network.connect();
    ethers = connection.ethers;

    [owner, escrowMock, creator, other] = await ethers.getSigners();

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
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);
      assert.equal(await reputationToken.reputationScore(creator.address), 1n);
    });

    it("increments reputation score on each mint", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1);
      await reputationToken.connect(escrowMock).mint(creator.address, 2, 1);
      assert.equal(await reputationToken.reputationScore(creator.address), 3n);
    });

    it("records mint history", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);
      await reputationToken.connect(escrowMock).mint(creator.address, 1, 1);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.equal(history.length, 2);
      assert.equal(history[0].campaignId, 1n);
      assert.equal(history[0].milestoneIndex, 0n);
      assert.equal(history[1].milestoneIndex, 1n);
    });

    it("creates unique token IDs per campaign+milestone combination", async () => {
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 2);

      const history = await reputationToken.getMintHistory(creator.address);
      assert.notEqual(history[0].tokenId, history[1].tokenId);
    });

    it("reverts if non-authorised caller tries to mint", async () => {
      await assert.rejects(
        reputationToken.connect(other).mint(creator.address, 0, 1),
        /caller is not an authorised minter/
      );
    });

    it("reverts on mint to zero address", async () => {
      await assert.rejects(
        reputationToken
          .connect(escrowMock)
          .mint("0x0000000000000000000000000000000000000000", 0, 1),
        /mint to zero address/
      );
    });

    it("emits ReputationMinted event", async () => {
      const tx = await reputationToken
        .connect(escrowMock)
        .mint(creator.address, 0, 1);
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
  // Soulbound — Non-Transferable
  // ─────────────────────────────────────────────

  describe("Soulbound (Non-Transferable)", async () => {
    let tokenId;

    beforeEach(async () => {
      await deployAll();
      await reputationToken.authoriseMinter(escrowMock.address);
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);

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
      await reputationToken.connect(escrowMock).mint(creator.address, 0, 1);

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