type Env = Omit<GeneratedEnv, "LEARNING_QUEUE"> & {
  DEEPSEEK_API_KEY: string;
  LEARNING_EXPORT_TOKEN?: string;
  LEARNING_QUEUE?: Queue<import("../src/durable-events.ts").PublicAskQueueEvent>;
  ACTOR_HMAC_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  TURNSTILE_EXPECTED_ACTION?: string;
  DEFAULT_LANGUAGE?: string;
  PUBLIC_ASK_PERSONA?: string;
  PERSIST_INTERACTIONS?: string;
  CF_AIG_TOKEN?: string;
};
