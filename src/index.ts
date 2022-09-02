import {
  createChannel,
  createClient,
  ChannelCredentials,
  Channel,
} from "nice-grpc";
import { AccountId, LayerNumber } from "./proto/gen/spacemesh/v1/types";
import { mnemonicToSeedSync } from "bip39";
import {
  AccountMeshDataFilter,
  AccountMeshDataFlag,
  AccountMeshDataQueryRequest,
  AccountMeshDataQueryResponse,
} from "./proto/gen/spacemesh/v1/mesh_types";
import {
  MeshServiceClient,
  MeshServiceDefinition,
} from "./proto/gen/spacemesh/v1/mesh";
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const nopedb = require("nope.db");
require("dotenv").config();
const db = new nopedb({
  path: "./data/stored_txs.json",
  seperator: ".",
  spaces: 2,
});

// https://discord.com/api/oauth2/authorize?client_id=1009365106666246144&permissions=2048&scope=bot

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
let discordChannel: any;

declare var Go: any;

const senderSeed: string = process.env.SEEDPHRASE!;

main();

function main() {
  client.once("ready", async () => {
    console.log("Ready!");
    discordChannel = client.channels.cache.get("1009542139128070254");

    while (1) {
      await getTxs();
      await sleep(10 * 1000);
    }
  });

  client.login(process.env.TOKEN);
}

const channel = createChannel(
  "api-devnet225.spacemesh.io:443",
  ChannelCredentials.createSsl()
);

let initialMsgSend = false;

async function getTxs() {
  console.log("getTxs");

  const senderPrivateKey = mnemonicToSeedSync(senderSeed);

  const slicedSenderPrivateKey = new Uint8Array(senderPrivateKey.slice(32));

  const enc = new TextEncoder();
  const saltAsUint8Array = enc.encode("Spacemesh blockmesh");
  let publicKey = new Uint8Array(32);
  let secretKey = new Uint8Array(64);

  const crypto = require("crypto");
  globalThis.crypto = {
    // @ts-ignore
    getRandomValues(b) {
      crypto.randomFillSync(b);
    },
  };
  require("./wasm_exec");

  await loadWasm("./src/ed25519.wasm")
    .then((wasm) => {
      secretKey =
        // @ts-ignore
        __deriveNewKeyPair(slicedSenderPrivateKey, 0, saltAsUint8Array);
      publicKey = secretKey.slice(32);
    })
    .catch((error) => {
      console.log("ouch", error);
    });

  if (!initialMsgSend) {
    console.log(`bot public key: ${toHexString(publicKey.slice(12))}`);
    discordChannel.send(
      `🌳 If you want to plant a tree send 1000 SMH to **0x${toHexString(
        publicKey.slice(12)
      )}** 💸`
    );
    initialMsgSend = true;
  }

  const client: MeshServiceClient = createClient(
    MeshServiceDefinition,
    channel
  );

  const accountQueryId: AccountId = { address: publicKey };

  const accountMeshQueryFilder: AccountMeshDataFilter = {
    accountId: accountQueryId,
    accountMeshDataFlags:
      AccountMeshDataFlag.ACCOUNT_MESH_DATA_FLAG_TRANSACTIONS,
  };

  const queryLayerNumber: LayerNumber = { number: 0 };

  const accountMeshQuery: AccountMeshDataQueryRequest = {
    filter: accountMeshQueryFilder,
    maxResults: 0,
    offset: 0,
    minLayer: queryLayerNumber,
  };

  let accountQueryResponse: AccountMeshDataQueryResponse =
    await client.accountMeshDataQuery(accountMeshQuery);

  console.log(toHexString(publicKey.slice(12)));

  accountQueryResponse.data.map((d) => {
    let sender = toHexString(d.meshTransaction?.transaction?.sender?.address);
    let receiver = toHexString(
      d.meshTransaction?.transaction?.coinTransfer?.receiver?.address
    );
    let amount = JSON.stringify(d.meshTransaction?.transaction?.amount?.value);

    if (
      !db.has(toHexString(d.meshTransaction?.transaction?.id?.id)) &&
      parseInt(amount) >= 1000000000000000 &&
      receiver == toHexString(publicKey.slice(12))
    ) {
      db.push(toHexString(d.meshTransaction?.transaction?.id?.id), {
        sender: sender,
        receiver: receiver,
        amount: amount,
      });
      discordChannel.send(
        `🌳 \`0x${sender}\` **sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!** ❤️ \nIf you also want to plant a tree send 1000 SMH to **0x${toHexString(
          publicKey.slice(12)
        )}** 💸`
      );
      console.log(
        `0x${sender} sent ${
          parseInt(amount) / 1000000000000
        } SMH and planted a tree!`
      );
    }
  });
}

function loadWasm(path: string) {
  const go = new Go();
  return new Promise((resolve, reject) => {
    WebAssembly.instantiate(fs.readFileSync(path), go.importObject)
      .then((result) => {
        go.run(result.instance);
        resolve(result.instance);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

const toHexString = (bytes: Uint8Array | Buffer | any): string =>
  bytes instanceof Buffer
    ? bytes.toString("hex")
    : bytes.reduce(
        (str: string, byte: number) => str + byte.toString(16).padStart(2, "0"),
        ""
      );

const fromHexString = (hexString: string) => {
  const bytes: number[] = [];
  for (let i = 0; i < hexString.length; i += 2) {
    bytes.push(parseInt(hexString.slice(i, i + 2), 16));
  }
  return Uint8Array.from(bytes);
};

function sleep(ms: number | undefined) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
