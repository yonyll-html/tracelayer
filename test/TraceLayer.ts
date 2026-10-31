import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const FARM = "green-valley-farms";
const DISTRIBUTOR = "freshroute-distribution";
const RETAILER = "harvest-market";

const FARM_NAME = "Green Valley Farms";
const DISTRIBUTOR_NAME = "FreshRoute Distribution";
const RETAILER_NAME = "Harvest Market";

describe("TraceLayer", function () {
  async function deployTraceLayer() {
    const traceLayer = await ethers.deployContract("TraceLayer");
    const [owner, recorder, stranger] = await ethers.getSigners();

    return { traceLayer, owner, recorder, stranger };
  }

  async function registerCoffeeBatch(traceLayer: any, batchId: string) {
    await traceLayer.registerBatch(
      batchId,
      "Coffee Beans",
      FARM_NAME,
      FARM
    );
  }

  async function transferBatch(
    traceLayer: any,
    batchId: string,
    operatorId: string,
    currentCustodian: string,
    destination: string,
    status: string,
    newCustodian: string,
    nonce: bigint
  ) {
    return traceLayer.recordTransfer(
      batchId,
      operatorId,
      currentCustodian,
      destination,
      status,
      newCustodian,
      nonce
    );
  }

  it("recognizes the three configured organizations", async function () {
    const { traceLayer } = await deployTraceLayer();

    expect(await traceLayer.isAllowedOrganization(FARM)).to.equal(true);
    expect(await traceLayer.isAllowedOrganization(DISTRIBUTOR)).to.equal(true);
    expect(await traceLayer.isAllowedOrganization(RETAILER)).to.equal(true);
  });

  it("rejects unrecognized organization IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    expect(await traceLayer.isAllowedOrganization("farm-a")).to.equal(false);
    expect(await traceLayer.isAllowedOrganization("warehouse-b")).to.equal(false);
    expect(await traceLayer.isAllowedOrganization("unknown-org")).to.equal(false);
  });

  it("registers a batch and stores its details", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch(
        "COFFEE-001",
        "Coffee Beans",
        FARM_NAME,
        FARM
      )
    )
      .to.emit(traceLayer, "BatchRegistered")
      .withArgs("COFFEE-001", "Coffee Beans", FARM_NAME, FARM);

    const batch = await traceLayer.getBatch("COFFEE-001");

    expect(batch.productName).to.equal("Coffee Beans");
    expect(batch.origin).to.equal(FARM_NAME);
    expect(batch.currentLocation).to.equal(FARM_NAME);
    expect(batch.status).to.equal("Registered");
    expect(batch.currentCustodian).to.equal(FARM);
    expect(batch.exists).to.equal(true);
  });

  it("records transfers and preserves the full history", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-002");

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-002",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        DISTRIBUTOR,
        0n
      )
    ).to.emit(traceLayer, "TransferRecorded");

    await transferBatch(
      traceLayer,
      "COFFEE-002",
      "operator-2",
      DISTRIBUTOR,
      RETAILER_NAME,
      "Delivered",
      RETAILER,
      1n
    );

    const batch = await traceLayer.getBatch("COFFEE-002");
    const history = await traceLayer.getTransferHistory("COFFEE-002");

    expect(batch.currentLocation).to.equal(RETAILER_NAME);
    expect(batch.status).to.equal("Delivered");
    expect(batch.currentCustodian).to.equal(RETAILER);

    expect(await traceLayer.getTransferCount("COFFEE-002")).to.equal(2n);

    expect(history[0].fromLocation).to.equal(FARM_NAME);
    expect(history[0].toLocation).to.equal(DISTRIBUTOR_NAME);
    expect(history[0].status).to.equal("In transit");
    expect(history[0].operatorId).to.equal("operator-1");
    expect(history[0].fromCustodian).to.equal(FARM);
    expect(history[0].toCustodian).to.equal(DISTRIBUTOR);

    expect(history[1].fromLocation).to.equal(DISTRIBUTOR_NAME);
    expect(history[1].toLocation).to.equal(RETAILER_NAME);
    expect(history[1].status).to.equal("Delivered");
    expect(history[1].operatorId).to.equal("operator-2");
    expect(history[1].fromCustodian).to.equal(DISTRIBUTOR);
    expect(history[1].toCustodian).to.equal(RETAILER);

    expect(await traceLayer.transferNonces("COFFEE-002")).to.equal(2n);
  });

  it("allows only the authorized relayer to register batches", async function () {
    const { traceLayer, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).registerBatch(
        "BATCH-001",
        "Cocoa",
        FARM_NAME,
        FARM
      )
    ).to.be.revertedWith("Only authorized relayer");
  });

  it("allows only the authorized relayer to record transfers", async function () {
    const { traceLayer, stranger } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-003");

    await expect(
      traceLayer.connect(stranger).recordTransfer(
        "COFFEE-003",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Only authorized relayer");
  });

  it("rejects transfers when the supplied organization is not the current custodian", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-004");

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-004",
        "operator-1",
        DISTRIBUTOR,
        DISTRIBUTOR_NAME,
        "In transit",
        RETAILER,
        0n
      )
    ).to.be.revertedWith("Not the current custodian");
  });

  it("prevents a former custodian from initiating another handoff", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-005");

    await transferBatch(
      traceLayer,
      "COFFEE-005",
      "operator-1",
      FARM,
      DISTRIBUTOR_NAME,
      "In transit",
      DISTRIBUTOR,
      0n
    );

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-005",
        "operator-2",
        FARM,
        RETAILER_NAME,
        "Delivered",
        RETAILER,
        1n
      )
    ).to.be.revertedWith("Not the current custodian");
  });

  it("rejects transfers with an outdated nonce", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-006");

    await transferBatch(
      traceLayer,
      "COFFEE-006",
      "operator-1",
      FARM,
      DISTRIBUTOR_NAME,
      "In transit",
      DISTRIBUTOR,
      0n
    );

    await expect(
      transferBatch(
        traceLayer,
        "COFFEE-006",
        "operator-2",
        DISTRIBUTOR,
        RETAILER_NAME,
        "Delivered",
        RETAILER,
        0n
      )
    ).to.be.revertedWith("Invalid transfer nonce");
  });

  it("increments the nonce after each successful transfer", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "COFFEE-007");

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(0n);

    await transferBatch(
      traceLayer,
      "COFFEE-007",
      "operator-1",
      FARM,
      DISTRIBUTOR_NAME,
      "In transit",
      DISTRIBUTOR,
      0n
    );

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(1n);

    await transferBatch(
      traceLayer,
      "COFFEE-007",
      "operator-2",
      DISTRIBUTOR,
      RETAILER_NAME,
      "Delivered",
      RETAILER,
      1n
    );

    expect(await traceLayer.transferNonces("COFFEE-007")).to.equal(2n);
  });

  it("rejects duplicate batch IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "BATCH-002");

    await expect(
      traceLayer.registerBatch(
        "BATCH-002",
        "Coffee",
        FARM_NAME,
        FARM
      )
    ).to.be.revertedWith("Batch already exists");
  });

  it("rejects transfers for nonexistent batches", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      transferBatch(
        traceLayer,
        "UNKNOWN",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "Received",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Batch does not exist");
  });

  it("allows the owner to change the relayer", async function () {
    const { traceLayer, recorder } = await deployTraceLayer();

    const owner = await traceLayer.owner();

    await expect(traceLayer.setRelayer(recorder.address))
      .to.emit(traceLayer, "RelayerChanged")
      .withArgs(owner, recorder.address);

    expect(await traceLayer.relayer()).to.equal(recorder.address);

    await expect(
      traceLayer.registerBatch(
        "BATCH-003",
        "Cocoa",
        FARM_NAME,
        FARM
      )
    ).to.be.revertedWith("Only authorized relayer");

    await traceLayer.connect(recorder).registerBatch(
      "BATCH-003",
      "Cocoa",
      FARM_NAME,
      FARM
    );

    expect(
      (await traceLayer.getBatch("BATCH-003")).productName
    ).to.equal("Cocoa");
  });

  it("prevents non-owners from changing the relayer", async function () {
    const { traceLayer, recorder, stranger } = await deployTraceLayer();

    await expect(
      traceLayer.connect(stranger).setRelayer(recorder.address)
    ).to.be.revertedWith("Only owner");
  });

  it("rejects a zero address as the new relayer", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.setRelayer(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid relayer address");
  });

  it("rejects transferring custody to the current custodian", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-001");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-001",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        FARM,
        0n
      )
    ).to.be.revertedWith("Already the current custodian");
  });

  it("rejects empty batch IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("", "Coffee", FARM_NAME, FARM)
    ).to.be.revertedWith("Batch ID required");
  });

  it("rejects empty product names", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-002", "", FARM_NAME, FARM)
    ).to.be.revertedWith("Product name required");
  });

  it("rejects empty origins", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-003", "Coffee", "", FARM)
    ).to.be.revertedWith("Origin required");
  });

  it("rejects empty initial custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch("EDGE-004", "Coffee", FARM_NAME, "")
    ).to.be.revertedWith("Custodian ID required");
  });

  it("rejects unrecognized initial custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await expect(
      traceLayer.registerBatch(
        "EDGE-009",
        "Coffee",
        FARM_NAME,
        "unknown-organization"
      )
    ).to.be.revertedWith("Unrecognized custodian");
  });

  it("rejects unrecognized current custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-010");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-010",
        "operator-1",
        "unknown-organization",
        DISTRIBUTOR_NAME,
        "In transit",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Unrecognized current custodian");
  });

  it("rejects unrecognized new custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-011");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-011",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        "unknown-organization",
        0n
      )
    ).to.be.revertedWith("Unrecognized new custodian");
  });

  it("rejects empty operator IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-005");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-005",
        "",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Operator ID required");
  });

  it("rejects empty transfer destinations", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-006");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-006",
        "operator-1",
        FARM,
        "",
        "In transit",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Destination required");
  });

  it("rejects empty transfer statuses", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-007");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-007",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "",
        DISTRIBUTOR,
        0n
      )
    ).to.be.revertedWith("Status required");
  });

  it("rejects empty new custodian IDs", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "EDGE-008");

    await expect(
      transferBatch(
        traceLayer,
        "EDGE-008",
        "operator-1",
        FARM,
        DISTRIBUTOR_NAME,
        "In transit",
        "",
        0n
      )
    ).to.be.revertedWith("New custodian required");
  });

  it("rejects replaying a transfer after custody has changed", async function () {
    const { traceLayer } = await deployTraceLayer();

    await registerCoffeeBatch(traceLayer, "REPLAY-001");

    const transfer = {
      batchId: "REPLAY-001",
      operatorId: "operator-1",
      currentCustodian: FARM,
      destination: DISTRIBUTOR_NAME,
      status: "In transit",
      newCustodian: DISTRIBUTOR,
      nonce: 0n
    };

    await transferBatch(
      traceLayer,
      transfer.batchId,
      transfer.operatorId,
      transfer.currentCustodian,
      transfer.destination,
      transfer.status,
      transfer.newCustodian,
      transfer.nonce
    );

    await expect(
      transferBatch(
        traceLayer,
        transfer.batchId,
        transfer.operatorId,
        transfer.currentCustodian,
        transfer.destination,
        transfer.status,
        transfer.newCustodian,
        transfer.nonce
      )
    ).to.be.revertedWith("Not the current custodian");

    expect(await traceLayer.getTransferCount(transfer.batchId)).to.equal(1n);
    expect(await traceLayer.transferNonces(transfer.batchId)).to.equal(1n);
  });
});