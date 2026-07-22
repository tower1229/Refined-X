import { runRegression } from "./staging-regression.mjs";

const endpoint =
  process.env.PUBLIC_ASK_PRODUCTION_URL ?? "https://ask.refined-x.com/ask";
const origin = process.env.PUBLIC_ASK_PRODUCTION_ORIGIN ?? "https://refined-x.com";

async function main() {
  const report = await runRegression({
    endpoint,
    origin,
    event: "public_ask_production_protocol_regression",
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
