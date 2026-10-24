import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("TraceLayer", function () {
  async function deployTraceLayer() {
    const traceLayer = await ethers.deployContract("TraceLayer");
    const [owner, recorder, stranger] = await ethers.getSigners();

    return { traceLayer, owner, recorder, stranger };
  }

  it("registers a batch and stores its details", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch(
        "COFFEE-001",
        "Coffee Beans",
        "Farm A"
      )
    )
      .to.emit(traceLayer, "BatchRegistered")
      .withArgs("COFFEE-001", "Coffee Beans", "Farm A", await traceLayer.owner());

    const batch = await traceLayer.getBatch("COFFEE-001");

    expect(batch.productName).to.equal("Coffee Beans");
    expect(batch.origin).to.equal("Farm A");
    expect(batch.currentLocation).to.equal("Farm A");
    expect(batch.status).to.equal("Registered");
    expect(batch.exists).to.equal(true);
  });

  it("records transfers and preserves the full history", async function () {
    const { traceLayer } = await deployTraceLayer();

    await traceLayer.registerBatch(
      "COFFEE-001",
      "Coffee Beans",
      "Farm A"
    );

    await traceLayer.recordTransfer(
      "COFFEE-001",
      "Warehouse B",
      "In transit"
    );

    await traceLayer.recordTransfer(
      "COFFEE-001",
      "Port C",
      "Exported"
    );

    const batch = await traceLayer.getBatch("COFFEE-001");
    const history = await traceLayer.getTransferHistory("COFFEE-001");

    expect(batch.currentLocation).to.equal("Port C");
    expect(batch.status).to.equal("Exported");
    expect(await traceLayer.getTransferCount("COFFEE-001")).to.equal(2n);

    expect(history[0].fromLocation).to.equal("Farm A");
    expect(history[0].toLocation).to.equal("Warehouse B");
    expect(history[0].status).to.equal("In transit");

    expect(history[1].fromLocation).to.equal("Warehouse B");
    expect(history[1].toLocation).to.equal("Port C");
    expect(history[1].status).to.equal("Exported");
  });

  it("rejects duplicate batch IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await traceLayer.registerBatch("BATCH-001", "Tea", "Farm A");

    await expect(
      traceLayer.registerBatch("BATCH-001", "Coffee", "Farm B")
    ).to.be.revertedWith("Batch already exists");
  });

  it("rejects transfers for nonexistent batches", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.recordTransfer("UNKNOWN", "Warehouse B", "Received")
    ).to.be.revertedWith("Batch does not exist");
  });

  it("prevents unauthorized accounts from registering batches", async function () {
    const { traceLayer, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).registerBatch(
        "BATCH-002",
        "Cocoa",
        "Farm B"
      )
    ).to.be.revertedWith("Not an authorized recorder");
  });

  it("allows the owner to authorize a recorder", async function () {
    const { traceLayer, recorder } = await deployTraceLayer();

    await traceLayer.setRecorderAuthorization(recorder.address, true);

    expect(
      await traceLayer.authorizedRecorders(recorder.address)
    ).to.equal(true);

    await expect(
      traceLayer.connect(recorder).registerBatch(
        "BATCH-003",
        "Cocoa",
        "Farm C"
      )
    ).to.emit(traceLayer, "BatchRegistered");

    const batch = await traceLayer.getBatch("BATCH-003");
    expect(batch.productName).to.equal("Cocoa");
  });

  it("prevents non-owners from authorizing recorders", async function () {
    const { traceLayer, recorder, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).setRecorderAuthorization(
        recorder.address,
        true
      )
    ).to.be.revertedWith("Only owner");
  });
});
